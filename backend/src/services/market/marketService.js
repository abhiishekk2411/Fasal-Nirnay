/**
 * Market Service — Orchestrates APMC Mandi data for crops and locations
 * Fetches real mandis from Agmarknet API, with MongoDB persistence and caching.
 * Completely purged hardcoded FALLBACK_MANDIS and FALLBACK_PRICES.
 */

const { fetchLiveAgmarknetPrices } = require('./agmarknetService');
const { geocodeLocation } = require('../location/geocodingService');
const Mandi = require('../../models/Mandi');
const MarketPrice = require('../../models/MarketPrice');
const { calculateHaversineDistance } = require('../location/distanceService');
const mongoose = require('mongoose');

const getMarketsByCropAndLocation = async (cropId, locationInput) => {
  // 1. Resolve farmer location coordinates
  let farmerCoords;
  if (typeof locationInput === 'object' && locationInput.latitude != null && locationInput.longitude != null) {
    farmerCoords = locationInput;
  } else {
    farmerCoords = await geocodeLocation(locationInput);
  }

  // 2. Fetch live data from Agmarknet API
  try {
    const liveMandis = await fetchLiveAgmarknetPrices(cropId, farmerCoords);
    if (liveMandis && liveMandis.length > 0) {
      return liveMandis;
    }
  } catch (apiErr) {
    console.warn('[MarketService] Live Agmarknet fetch warning:', apiErr.message);
  }

  // 3. Fallback to MongoDB cached mandis and prices if Agmarknet returned 0 or timed out
  try {
    if (mongoose.connection.readyState === 1) {
      const dbMandis = await Mandi.find({ active: true }).lean();
      if (dbMandis && dbMandis.length > 0) {
        const mandiIds = dbMandis.map(m => m.mandiId);
        const prices = await MarketPrice.find({
          cropId: cropId.toLowerCase(),
          mandiId: { $in: mandiIds }
        }).sort({ date: -1 }).lean();

        if (prices.length > 0) {
          const results = [];
          for (const mandi of dbMandis) {
            const p = prices.find(price => price.mandiId === mandi.mandiId);
            if (p) {
              const distanceKm = calculateHaversineDistance(
                farmerCoords.latitude,
                farmerCoords.longitude,
                mandi.latitude,
                mandi.longitude
              );
              results.push({
                mandiId: mandi.mandiId,
                mandiName: mandi.name,
                city: mandi.city,
                state: mandi.state,
                latitude: mandi.latitude,
                longitude: mandi.longitude,
                distanceKm: Math.round(distanceKm),
                cropId: p.cropId,
                varietyId: p.varietyId,
                price: p.price,
                unit: p.unit
              });
            }
          }
          if (results.length > 0) {
            results.sort((a, b) => a.distanceKm - b.distanceKm);
            const radius250 = results.filter(r => r.distanceKm <= 250);
            return radius250.length > 0 ? radius250 : results.slice(0, 5);
          }
        }
      }
    }
  } catch (dbErr) {
    console.warn('[MarketService] DB query warning:', dbErr.message);
  }

  return [];
};

module.exports = {
  getMarketsByCropAndLocation
};
