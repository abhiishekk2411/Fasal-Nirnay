/**
 * Dynamic Geocoding Service using OpenStreetMap Nominatim
 * Includes an in-memory cache and resilient fallbacks for key agricultural districts
 * to ensure high availability during telephony/IVR calls and network timeouts.
 */

const locationCache = new Map();

// High-availability fallback coordinates for primary agricultural regions
const AGRICULTURAL_FALLBACKS = {
  'nashik': { latitude: 19.9975, longitude: 73.7898, displayName: 'Nashik, Maharashtra, India', city: 'Nashik', district: 'Nashik', state: 'Maharashtra' },
  'pune': { latitude: 18.5204, longitude: 73.8567, displayName: 'Pune, Maharashtra, India', city: 'Pune', district: 'Pune', state: 'Maharashtra' },
  'solapur': { latitude: 17.6599, longitude: 75.9064, displayName: 'Solapur, Maharashtra, India', city: 'Solapur', district: 'Solapur', state: 'Maharashtra' },
  'nagpur': { latitude: 21.1458, longitude: 79.0882, displayName: 'Nagpur, Maharashtra, India', city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra' },
  'pimpalgaon': { latitude: 20.1700, longitude: 73.9800, displayName: 'Pimpalgaon, Maharashtra, India', city: 'Pimpalgaon', district: 'Nashik', state: 'Maharashtra' },
  'lasalgaon': { latitude: 20.1400, longitude: 74.2200, displayName: 'Lasalgaon, Maharashtra, India', city: 'Lasalgaon', district: 'Nashik', state: 'Maharashtra' }
};

/**
 * Reverse geocodes coordinates to a human-readable location with state and district.
 */
const reverseGeocode = async (latitude, longitude) => {
  const cacheKey = `rev_${Number(latitude).toFixed(4)}_${Number(longitude).toFixed(4)}`;
  if (locationCache.has(cacheKey)) {
    return locationCache.get(cacheKey);
  }

  // Check known fallbacks by proximity
  for (const fallback of Object.values(AGRICULTURAL_FALLBACKS)) {
    if (Math.abs(fallback.latitude - latitude) < 0.05 && Math.abs(fallback.longitude - longitude) < 0.05) {
      locationCache.set(cacheKey, fallback);
      return fallback;
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'FasalNirnay-App/2.0 (agri-decision-support)',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Nominatim reverse error: ${response.status}`);
    }

    const data = await response.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
    const district = addr.state_district || addr.county || city;
    const state = addr.state || '';
    const displayName = [city, district !== city ? district : '', state]
      .filter(Boolean)
      .join(', ') || data.display_name || `${latitude}, ${longitude}`;

    const result = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      displayName,
      city,
      district,
      state
    };

    locationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('[Geocoding] Reverse Geocoding Network Warning:', error.message);
    return {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      displayName: `${latitude}, ${longitude}`,
      city: '',
      district: '',
      state: ''
    };
  }
};

/**
 * Geocodes a text location string into latitude, longitude, state, district.
 */
const geocodeLocation = async (locationInput) => {
  if (!locationInput) {
    throw new Error('कृपया एक सही स्थान दर्ज करें।');
  }

  // If already coordinates object
  if (typeof locationInput === 'object' && locationInput.latitude != null && locationInput.longitude != null) {
    return await reverseGeocode(locationInput.latitude, locationInput.longitude);
  }

  if (typeof locationInput !== 'string') {
    throw new Error('स्थान की जानकारी अमान्य है।');
  }

  const normalizedInput = locationInput.trim().toLowerCase();

  // 1. Check in-memory cache
  if (locationCache.has(normalizedInput)) {
    return locationCache.get(normalizedInput);
  }

  // 2. Check known agricultural fallback match
  for (const [key, fallback] of Object.entries(AGRICULTURAL_FALLBACKS)) {
    if (normalizedInput === key || normalizedInput.startsWith(key)) {
      locationCache.set(normalizedInput, fallback);
      return fallback;
    }
  }

  // 3. Query Nominatim API
  try {
    const queryTerm = normalizedInput.includes('india') ? normalizedInput : `${normalizedInput}, India`;
    const query = encodeURIComponent(queryTerm);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'FasalNirnay-App/2.0 (agri-decision-support)',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Nominatim API Error: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Location not found: "${locationInput}"`);
    }

    const item = data[0];
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
    const district = addr.state_district || addr.county || city;
    const state = addr.state || '';

    const result = {
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      displayName: item.display_name,
      city,
      district,
      state
    };

    locationCache.set(normalizedInput, result);
    return result;

  } catch (error) {
    console.warn(`[Geocoding] Nominatim lookup warning for "${locationInput}":`, error.message);
    // If agricultural fallback matches partially
    for (const [key, fallback] of Object.entries(AGRICULTURAL_FALLBACKS)) {
      if (normalizedInput.includes(key)) {
        return fallback;
      }
    }
    if (error.message.includes('Location not found')) {
      throw new Error(`स्थान "${locationInput}" नहीं मिला। कृपया अपने ज़िले या राज्य का नाम साथ लिखकर पुनः प्रयास करें।`);
    }
    throw new Error(`स्थान "${locationInput}" का पता लगाने में समस्या आई: ${error.message}`);
  }
};

module.exports = {
  geocodeLocation,
  reverseGeocode
};
