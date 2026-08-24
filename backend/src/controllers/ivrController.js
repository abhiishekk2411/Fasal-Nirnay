const decisionEngine = require('../services/decision/decisionEngine');
const marketService = require('../services/market/marketService');
const trendService = require('../services/market/trendService');
const { geocodeLocation } = require('../services/location/geocodingService');
const { calculateHaversineDistance } = require('../services/location/distanceService');
const { calculateTransportCost } = require('../services/decision/transportService');
const { getWeatherForecast } = require('../services/weather/weatherService');
const { calculateWeatherRisk } = require('../services/weather/weatherRiskService');
const MarketPrice = require('../models/MarketPrice');
const mongoose = require('mongoose');

// Helper to map DTMF digits to actual inputs
const mapIvrInputs = (cropDigit, quantityDigit, locationDigit) => {
  let cropId = 'tomato';
  let varietyId = 'hybrid';
  let quantityKg = 800;
  let location = 'Nashik';

  // Crop Mapping
  if (cropDigit === '1') {
    cropId = 'tomato';
    varietyId = 'hybrid';
  } else if (cropDigit === '2') {
    cropId = 'onion';
    varietyId = 'red';
  }

  // Quantity Mapping
  if (quantityDigit === '1') {
    quantityKg = 400;
  } else if (quantityDigit === '2') {
    quantityKg = 800;
  } else if (quantityDigit === '3') {
    quantityKg = 1200;
  }

  // Location Mapping (Fixed to Nashik for demo, ignoring digit if provided)
  if (locationDigit === '1' || locationDigit === undefined) {
    location = 'Nashik';
  }

  return { cropId, varietyId, quantityKg, location };
};

// @desc    Analyze crop selling decision for IVR (Exotel Passthru)
// @route   POST/GET /api/ivr/analyze
// @access  Public
const analyzeIvrDecision = async (req, res, next) => {
  try {
    // Exotel Passthru sends data usually via GET or POST depending on setup.
    // We check both query and body to be tolerant.
    const inputData = { ...req.query, ...req.body };
    
    // Log safely, avoid logging headers or full request objects
    console.log('[IVR] Received request parameters:', Object.keys(inputData));

    // Support both direct values ('tomato') or digit mapping ('1')
    let cropInput = inputData.crop || inputData.cropDigit;
    let quantityInput = inputData.quantity || inputData.quantityDigit;
    let locationInput = inputData.location || inputData.locationDigit;
    
    // Map inputs if they are just digits
    let cropId, varietyId, quantityKg, location;
    
    // Strict validation for demo IVR DTMF
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(String(cropInput))) {
      if (!['1', '2'].includes(String(cropInput))) {
        return res.json({ success: false, message: "Invalid crop selection. Please press 1 for Tomato, 2 for Onion." });
      }
      if (!['1', '2', '3'].includes(String(quantityInput))) {
        return res.json({ success: false, message: "Invalid quantity selection. Please press 1, 2, or 3." });
      }
      
      const mapped = mapIvrInputs(String(cropInput), String(quantityInput), String(locationInput));
      cropId = mapped.cropId;
      varietyId = mapped.varietyId;
      quantityKg = mapped.quantityKg;
      location = mapped.location;
    } else {
      // Allow direct passing for testing (e.g. crop=tomato)
      cropId = cropInput;
      varietyId = inputData.variety || 'hybrid';
      quantityKg = parseFloat(quantityInput);
      location = locationInput;
    }

    if (!cropId || !quantityKg || !location) {
      return res.json({
        success: false,
        message: "Invalid inputs provided for IVR analysis."
      });
    }

    const isExotelMode = inputData.mode === 'exotel';

    // Helper to send response based on mode
    const sendResponse = (success, message, data = {}) => {
      if (isExotelMode) {
        res.type('text/plain');
        return res.send(message);
      }
      return res.json({ success, message, ...data });
    };

    // 1. Geocode farmer location
    let farmerCoords;
    try {
      farmerCoords = await geocodeLocation(location);
    } catch (err) {
      console.error('[IVR] Geocoding Error:', err.message);
      return sendResponse(false, "Sthaan ka pata nahi lag paya.");
    }

    // 2. Fetch Weather Forecast and Calculate Risk
    let weatherRisk;
    try {
      const weatherData = await getWeatherForecast(farmerCoords.latitude, farmerCoords.longitude);
      weatherRisk = calculateWeatherRisk(weatherData, cropId);
    } catch (err) {
      console.warn('[IVR] Weather fallback:', err.message);
      weatherRisk = { riskLevel: 'low', riskPercentage: 0, cropPerishability: 'low' }; // Safe fallback
    }

    // 3. Fetch relevant market data from DB
    const marketData = await marketService.getMarketsByCropAndLocation(cropId, location);

    if (!marketData || marketData.length === 0) {
      return sendResponse(false, "Is fasal ke liye abhi mandi ka bhav uplabdh nahi hai.");
    }

    // 4. Process each mandi: Distance, Transport, Trend, Risk
    const mandisWithDetails = await Promise.all(marketData.map(async (m) => {
      const mandiLat = m.latitude;
      const mandiLon = m.longitude;
      
      let distanceKm = 50; 
      if (mandiLat && mandiLon) {
        distanceKm = calculateHaversineDistance(farmerCoords.latitude, farmerCoords.longitude, mandiLat, mandiLon);
      }
      
      const transportCost = calculateTransportCost(distanceKm, quantityKg);
      
      const expectedRevenue = m.price * quantityKg;
      const riskPenalty = Math.round(expectedRevenue * (weatherRisk.riskPercentage / 100));
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      let historicalPrices = [];
      try {
        if (mongoose.connection.readyState === 1) {
          historicalPrices = await MarketPrice.find({
            cropId: cropId.toLowerCase(),
            mandiId: m.mandiId.toLowerCase(),
            varietyId: varietyId.toLowerCase(),
            date: { $gte: startDate }
          }).sort({ date: 1 }).lean();
        }
      } catch (histErr) {
        // Suppress
      }

      let trendData = { trend: 'stable', percentageChange: 0, estimatedRange: { min: m.price, max: m.price } };
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
      quantityKg,
      farmerLocation: location,
      mandis: mandisWithDetails,
      weatherRisk
    });

    // 6. Return simplified, predictable JSON response for Exotel
    const bestMandiId = decisionResult.bestMandi;
    const bestMandiObj = decisionResult.rankedMandis.find(m => m.mandiId === bestMandiId) || decisionResult.rankedMandis[0];

    const recommendationMsg = `Aapke diye gaye details ke anusaar ${bestMandiObj.mandiName} ek behtar vikalp hai. Aapki anumanit shuddh kamai ${bestMandiObj.expectedNetReturn} rupaye hai.`;

    return sendResponse(true, recommendationMsg, {
      mandiName: bestMandiObj.mandiName,
      expectedNetReturn: bestMandiObj.expectedNetReturn,
      sellNow: bestMandiObj.sell_now_vs_wait === 'sell_now',
      trend: bestMandiObj.trend,
      weatherRisk: weatherRisk.riskLevel
    });

  } catch (error) {
    console.error('[IVR] Controller Error:', error);
    // Exotel needs a reliable format even on error
    const inputData = { ...req.query, ...req.body };
    if (inputData.mode === 'exotel') {
      res.type('text/plain');
      return res.send("Takneeki samasya ke karan jankari nahi mil payi. Kripya thodi der baad prayas karein.");
    }
    return res.json({
      success: false,
      message: "Analysis is temporarily unavailable."
    });
  }
};

module.exports = {
  analyzeIvrDecision
};
