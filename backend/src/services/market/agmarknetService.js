/**
 * Agmarknet Service — Fetches live APMC Mandi prices from Data.gov.in
 * Connects directly to Government of India Open Government Data (OGD) Agmarknet API.
 */

const Mandi = require('../../models/Mandi');
const MarketPrice = require('../../models/MarketPrice');
const { calculateHaversineDistance } = require('../location/distanceService');
const mongoose = require('mongoose');

const COMMODITY_MAP = {
  tomato: 'Tomato',
  onion: 'Onion',
  potato: 'Potato',
  wheat: 'Wheat',
  rice: 'Paddy(Dhan)(Common)',
  paddy: 'Paddy(Dhan)(Common)',
  cotton: 'Cotton',
  soybean: 'Soyabean',
  soyabean: 'Soyabean',
  maize: 'Maize',
  chilli: 'Chilli Green',
  brinjal: 'Brinjal',
  cabbage: 'Cabbage',
  cauliflower: 'Cauliflower',
  grapes: 'Grapes',
  pomegranate: 'Pomegranate',
  sugarcane: 'Sugarcane'
};

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

const cleanMarketQuery = (market, district, state) => {
  const cleaned = (market || '')
    .replace(/\b(APMC|Mandi|Market|Rythu\s+Bazar|Sub\s+Yard)\b/gi, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  return cleaned || district || market;
};

// Simple in-memory cache for mandi coordinates during runtime
const mandiCoordCache = new Map();

/**
 * Geocodes an APMC market using Nominatim with MongoDB persistence
 */
const resolveMandiCoordinates = async (market, district, state) => {
  const mandiId = slugify(`${market}-${district || state || 'mandi'}`);
  
  if (mandiCoordCache.has(mandiId)) {
    return mandiCoordCache.get(mandiId);
  }

  // 1. Check MongoDB Mandi model
  try {
    if (mongoose.connection.readyState === 1) {
      const existing = await Mandi.findOne({ mandiId }).lean();
      if (existing && existing.latitude && existing.longitude) {
        const coords = {
          mandiId: existing.mandiId,
          name: existing.name,
          city: existing.city,
          state: existing.state,
          latitude: existing.latitude,
          longitude: existing.longitude
        };
        mandiCoordCache.set(mandiId, coords);
        return coords;
      }
    }
  } catch (dbErr) {
    console.warn('[Agmarknet] Mandi lookup DB warning:', dbErr.message);
  }

  // 2. Resolve via Nominatim
  let resolvedLat = null;
  let resolvedLon = null;

  const candidateQueries = [
    `${cleanMarketQuery(market, district, state)}, ${district || ''}, ${state || ''}, India`,
    `${district || market}, ${state || ''}, India`,
    `${state || ''}, India`
  ];

  for (const queryTerm of candidateQueries) {
    if (resolvedLat && resolvedLon) break;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryTerm)}&format=json&limit=1`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'FasalNirnay-AgmarknetLookup/2.0 (agri-decision-support)',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          resolvedLat = parseFloat(data[0].lat);
          resolvedLon = parseFloat(data[0].lon);
          break;
        }
      }
    } catch (nomErr) {
      // Continue to next candidate query
    }
  }

  // If geocoding completely fails, default to central India coordinates
  if (!resolvedLat || !resolvedLon) {
    resolvedLat = 20.5937;
    resolvedLon = 78.9629;
  }

  const mandiRecord = {
    mandiId,
    name: market.trim(),
    city: district || market.trim(),
    state: state || 'India',
    latitude: resolvedLat,
    longitude: resolvedLon
  };

  mandiCoordCache.set(mandiId, mandiRecord);

  // Upsert into MongoDB Mandi asynchronously
  if (mongoose.connection.readyState === 1) {
    Mandi.findOneAndUpdate(
      { mandiId },
      { ...mandiRecord, active: true },
      { upsert: true, returnDocument: 'after' }
    ).catch(err => console.warn('[Agmarknet] Mandi save warning:', err.message));
  }

  return mandiRecord;
};

/**
 * Fetch live mandi prices from Agmarknet API for commodity and farmer location.
 */
const fetchLiveAgmarknetPrices = async (cropId, farmerCoords) => {
  const apiKey = process.env.AGMARKET_API_KEY || process.env.DATA_GOV_API_KEY;
  if (!apiKey) {
    throw new Error('AGMARKET_API_KEY is missing in environment variables.');
  }

  const commodity = COMMODITY_MAP[cropId.toLowerCase()] || 
    cropId.charAt(0).toUpperCase() + cropId.slice(1).toLowerCase();

  const baseUrl = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';
  let records = [];

  // 1. First attempt: filter by state if farmer state is known
  if (farmerCoords.state) {
    try {
      const stateFilter = encodeURIComponent(farmerCoords.state);
      const url = `${baseUrl}?api-key=${apiKey}&format=json&limit=50&filters[commodity]=${encodeURIComponent(commodity)}&filters[state]=${stateFilter}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (data.records && data.records.length > 0) {
          records = data.records;
        }
      }
    } catch (err) {
      console.warn('[Agmarknet] State-filtered fetch failed, will try national fetch:', err.message);
    }
  }

  // 2. Second attempt: fetch by commodity across India if no records found
  if (records.length === 0) {
    try {
      const url = `${baseUrl}?api-key=${apiKey}&format=json&limit=50&filters[commodity]=${encodeURIComponent(commodity)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (data.records && data.records.length > 0) {
          records = data.records;
        }
      }
    } catch (err) {
      console.error('[Agmarknet] National commodity fetch failed:', err.message);
    }
  }

  if (records.length === 0) {
    return [];
  }

  // 3. Process records: convert modal_price to ₹/kg, resolve coordinates, compute distance
  const processedMandis = await Promise.all(records.map(async (rec) => {
    const rawModalPrice = parseFloat(rec.modal_price);
    if (!rawModalPrice || isNaN(rawModalPrice) || rawModalPrice <= 0) {
      return null;
    }

    // Convert modal_price from ₹/quintal to ₹/kg
    const pricePerKg = Math.round((rawModalPrice / 100) * 10) / 10;

    const mandiDetails = await resolveMandiCoordinates(rec.market, rec.district, rec.state);

    const distanceKm = calculateHaversineDistance(
      farmerCoords.latitude,
      farmerCoords.longitude,
      mandiDetails.latitude,
      mandiDetails.longitude
    );

    // Upsert into MongoDB MarketPrice for trend tracking
    if (mongoose.connection.readyState === 1) {
      MarketPrice.create({
        cropId: cropId.toLowerCase(),
        mandiId: mandiDetails.mandiId,
        varietyId: (rec.variety || 'standard').toLowerCase(),
        price: pricePerKg,
        unit: 'kg',
        date: new Date(),
        source: 'agmarknet_live'
      }).catch(() => {});
    }

    return {
      mandiId: mandiDetails.mandiId,
      mandiName: `${rec.market.trim()} Mandi`,
      city: mandiDetails.city,
      state: mandiDetails.state,
      latitude: mandiDetails.latitude,
      longitude: mandiDetails.longitude,
      distanceKm: Math.round(distanceKm),
      cropId: cropId.toLowerCase(),
      varietyId: (rec.variety || 'standard').toLowerCase(),
      price: pricePerKg,
      unit: 'kg',
      arrivalDate: rec.arrival_date,
      modalPriceQuintal: rawModalPrice
    };
  }));

  const validMandis = processedMandis.filter(Boolean);

  // Filter within 250 km radius of farmer
  const radius250Mandis = validMandis.filter(m => m.distanceKm <= 250);

  // If we found mandis within 250 km, return them sorted by distance
  if (radius250Mandis.length > 0) {
    radius250Mandis.sort((a, b) => a.distanceKm - b.distanceKm);
    return radius250Mandis;
  }

  // Fallback: If no mandis are strictly within 250 km (e.g. commodity reported only in neighboring state),
  // return the closest 5 available mandis so farmer still gets live recommendations
  validMandis.sort((a, b) => a.distanceKm - b.distanceKm);
  return validMandis.slice(0, 5);
};

module.exports = {
  fetchLiveAgmarknetPrices,
  COMMODITY_MAP
};
