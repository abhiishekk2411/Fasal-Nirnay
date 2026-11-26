const recommendationService = require('../services/decision/recommendationService');
const DecisionHistory = require('../models/DecisionHistory');
const mongoose = require('mongoose');

// @desc    Analyze crop selling decision (Web & API)
// @route   POST /api/decision/analyze
// @access  Public
const analyzeDecision = async (req, res, next) => {
  try {
    const { cropId, varietyId = 'hybrid', quantityKg, location, coordinates } = req.body;

    if (!cropId || quantityKg == null || (!location && !coordinates)) {
      res.status(400);
      throw new Error('कृपया फसल, मात्रा और स्थान की जानकारी भरें। (Crop, quantity and location are required)');
    }

    if (typeof location === 'string' && location.trim() === '' && !coordinates) {
      res.status(400);
      throw new Error('स्थान की जानकारी खाली नहीं हो सकती। (Location cannot be empty)');
    }

    const numericQuantity = parseFloat(quantityKg);
    if (isNaN(numericQuantity) || numericQuantity <= 0) {
      res.status(400);
      throw new Error('मात्रा एक सही संख्या होनी चाहिए और 0 से अधिक होनी चाहिए। (Quantity must be positive)');
    }

    // Call unified recommendation pipeline
    const result = await recommendationService.getRecommendation({
      cropId,
      varietyId,
      quantityKg: numericQuantity,
      location,
      coordinates
    });

    // Save Decision to History (Non-blocking)
    try {
      const bestMandi = result.bestMandiDetails;
      if (bestMandi && mongoose.connection.readyState === 1) {
        await DecisionHistory.create({
          userId: 'demo_farmer_001',
          cropId: result.cropId,
          varietyId: result.varietyId,
          quantityKg: result.quantityKg,
          farmerLocation: result.farmerLocation,
          selectedMandiId: bestMandi.mandiId,
          selectedMandiName: bestMandi.mandiName,
          selectedMandiPrice: bestMandi.price,
          expectedRevenue: bestMandi.expectedRevenue,
          transportCost: bestMandi.transportCost,
          riskPenalty: bestMandi.riskPenalty,
          expectedNetReturn: bestMandi.expectedNetReturn,
          trend: bestMandi.trend,
          trendPercentage: bestMandi.trendPercentage,
          sell_now_vs_wait: bestMandi.sell_now_vs_wait,
          weatherRiskLevel: result.weatherRisk.riskLevel,
          weatherRiskPercentage: result.weatherRisk.riskPercentage,
          timestamp: new Date()
        });
      }
    } catch (histSaveErr) {
      console.warn('History save warning:', histSaveErr.message);
    }

    // Return structured JSON matching 100% of the Frontend API Contract
    return res.json({
      success: true,
      data: {
        farmerLocation: {
          input: location,
          latitude: result.farmerCoordinates.latitude,
          longitude: result.farmerCoordinates.longitude,
          displayName: result.farmerCoordinates.displayName || location
        },
        weather: {
          ...result.weatherData,
          riskLevel: result.weatherRisk.riskLevel,
          riskPercentage: result.weatherRisk.riskPercentage,
          cropPerishability: result.weatherRisk.cropPerishability
        },
        bestMandi: result.bestMandi,
        rankedMandis: result.rankedMandis,
        reasoningTags: result.reasoningTags,
        provenance: result.provenance
      }
    });

  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
    next(error);
  }
};

module.exports = {
  analyzeDecision
};
