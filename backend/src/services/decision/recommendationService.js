/**
 * Shared Recommendation Service
 * Single source of truth for crop selling recommendations.
 * Reused by both Web (decisionController) and IVR (ivrController).
 */

const decisionEngine = require('./decisionEngine');
const marketService = require('../market/marketService');
const trendService = require('../market/trendService');
const { geocodeLocation } = require('../location/geocodingService');
const { calculateHaversineDistance } = require('../location/distanceService');
const { calculateTransportCost } = require('./transportService');
const { getWeatherForecast } = require('../weather/weatherService');
const { calculateWeatherRisk } = require('../weather/weatherRiskService');
const MarketPrice = require('../../models/MarketPrice');
const mongoose = require('mongoose');

/**
 * Executes the full recommendation pipeline.
 * @param {Object} params
 * @param {string} params.cropId - e.g. 'tomato'
 * @param {string} [params.varietyId='hybrid'] - e.g. 'hybrid', 'red'
 * @param {number} params.quantityKg - Quantity in kilograms
 * @param {string|Object} params.location - City/district name or location string
 * @param {Object} [params.coordinates] - Optional { latitude, longitude }
 * @param {Array} [params.customMandis] - Optional mandi array for deterministic testing
 * @returns {Promise<Object>} Recommendation decision result with provenance
 */
const getRecommendation = async ({
  cropId,
  varietyId = 'hybrid',
  quantityKg,
  location,
  coordinates,
  customMandis = null
}) => {
  if (!cropId) {
    throw new Error('कृपया फसल की जानकारी दें। (Crop ID is required)');
  }

  const numericQuantity = parseFloat(quantityKg);
  if (isNaN(numericQuantity) || numericQuantity <= 0) {
    throw new Error('मात्रा एक सही संख्या होनी चाहिए और 0 से अधिक होनी चाहिए। (Invalid quantity)');
  }

  if (!location && !coordinates) {
    throw new Error('स्थान की जानकारी आवश्यक है। (Location or coordinates required)');
  }

  // 1. Geocode farmer location
  let farmerCoords;
  if (coordinates && coordinates.latitude != null && coordinates.longitude != null) {
    farmerCoords = await geocodeLocation(coordinates);
    if (location && typeof location === 'string' && !farmerCoords.displayName) {
      farmerCoords.displayName = location;
    }
  } else {
    farmerCoords = await geocodeLocation(location);
  }

  // 2. Fetch Weather Forecast and Calculate Risk
  let weatherData = { available: false, riskLevel: 'unknown', reason: 'Weather service unavailable or key missing' };
  try {
    const fetchedWeather = await getWeatherForecast(farmerCoords.latitude, farmerCoords.longitude);
    if (fetchedWeather) {
      weatherData = fetchedWeather;
    }
  } catch (wErr) {
    console.warn('[RecommendationService] Weather fetch warning:', wErr.message);
  }
  const weatherRisk = calculateWeatherRisk(weatherData, cropId);

  // 3. Fetch relevant market data from Agmarknet / DB (or customMandis if injected)
  let marketData = customMandis;
  let dataSource = 'Provided Test Data';

  if (!marketData) {
    marketData = await marketService.getMarketsByCropAndLocation(cropId, farmerCoords);
    dataSource = (process.env.AGMARKET_API_KEY || process.env.DATA_GOV_API_KEY)
      ? 'Agmarknet OGD Live API (data.gov.in)'
      : 'Cached APMC Mandis (MongoDB)';
  } else {
    dataSource = 'Mocked Test Fixture (Deterministic Offline Evaluation)';
  }

  if (!marketData || marketData.length === 0) {
    const error = new Error(`इस फसल के लिए वर्तमान में आसपास की मंडियों का भाव उपलब्ध नहीं है। कृपया अन्य फसल चुनें। (No market data found for crop: ${cropId})`);
    error.statusCode = 404;
    error.code = 'NO_MARKET_DATA';
    throw error;
  }

  // 4. Process each mandi: Distance, Transport, Trend, Risk
  const mandisWithDetails = await Promise.all(marketData.map(async (m) => {
    let mandiLat = m.latitude;
    let mandiLon = m.longitude;

    if (!mandiLat || !mandiLon) {
      try {
        const resolved = await geocodeLocation(m.mandiName || m.mandiId || m.name);
        mandiLat = resolved.latitude;
        mandiLon = resolved.longitude;
      } catch (mErr) {
        mandiLat = farmerCoords.latitude;
        mandiLon = farmerCoords.longitude;
      }
    }

    const distanceKm = m.distanceKm != null
      ? m.distanceKm
      : Math.round(calculateHaversineDistance(farmerCoords.latitude, farmerCoords.longitude, mandiLat, mandiLon));

    const transportCost = calculateTransportCost(distanceKm, numericQuantity);

    // Calculate Risk Penalty
    const expectedRevenue = m.price * numericQuantity;
    const riskPenalty = Math.round(expectedRevenue * ((weatherRisk.riskPercentage || 0) / 100));

    // Fetch historical prices to get trend
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    let historicalPrices = [];
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        historicalPrices = await MarketPrice.find({
          cropId: cropId.toLowerCase(),
          mandiId: (m.mandiId || '').toLowerCase(),
          varietyId: varietyId.toLowerCase(),
          date: { $gte: startDate }
        }).sort({ date: 1 }).lean();
      }
    } catch (histErr) {
      console.warn('[RecommendationService] Historical prices query warning:', histErr.message);
    }

    let trendData = {
      trend: m.trend || 'stable',
      trendPercentage: m.trendPercentage != null ? m.trendPercentage : 0,
      estimatedRange: m.estimatedRange || { min: m.price, max: m.price }
    };

    if (historicalPrices && historicalPrices.length > 0) {
      const calculatedTrend = trendService.calculateTrend(historicalPrices);
      trendData = {
        trend: calculatedTrend.trend,
        trendPercentage: calculatedTrend.percentageChange,
        estimatedRange: calculatedTrend.estimatedRange
      };
    }

    return {
      ...m,
      distanceKm,
      transportCost,
      riskPenalty,
      ...trendData
    };
  }));

  // 5. Pass everything to pure Decision Engine
  const decisionResult = decisionEngine.calculateDecision({
    cropId,
    varietyId,
    quantityKg: numericQuantity,
    farmerLocation: farmerCoords.displayName || location,
    mandis: mandisWithDetails,
    weatherRisk
  });

  const bestMandiId = decisionResult.bestMandi;
  const bestMandiDetails = decisionResult.rankedMandis.find(m => m.mandiId === bestMandiId) || decisionResult.rankedMandis[0];

  // 6. Assemble Provenance
  const transportRateBracket = numericQuantity <= 500 ? 4 : (numericQuantity <= 1000 ? 5 : 6);
  const provenance = {
    dataSource,
    farmerLocation: {
      input: location,
      resolvedName: farmerCoords.displayName || location,
      latitude: farmerCoords.latitude,
      longitude: farmerCoords.longitude
    },
    weather: {
      available: !!weatherData.available,
      riskLevel: weatherRisk.riskLevel,
      status: weatherData.available ? 'Live Weather Available' : 'Weather Data Unavailable (No Live Forecast)',
      rainProbability: weatherRisk.rainProbability || 0,
      rainMm: weatherRisk.rainMm || 0,
      perishability: weatherRisk.cropPerishability
    },
    transportConfig: {
      ratePerKm: transportRateBracket,
      bracket: numericQuantity <= 500 ? '<=500kg (₹4/km)' : (numericQuantity <= 1000 ? '501-1000kg (₹5/km)' : '>1000kg (₹6/km)')
    },
    mandisEvaluatedCount: mandisWithDetails.length,
    timestamp: new Date().toISOString()
  };

  return {
    cropId,
    varietyId,
    quantityKg: numericQuantity,
    farmerLocation: farmerCoords.displayName || location,
    farmerCoordinates: farmerCoords,
    weatherData,
    weatherRisk,
    bestMandi: bestMandiId,
    bestMandiDetails,
    rankedMandis: decisionResult.rankedMandis,
    reasoningTags: decisionResult.reasoningTags,
    provenance
  };
};

module.exports = {
  getRecommendation
};
