/**
 * Dynamic Geocoding Service using OpenStreetMap Nominatim
 * Includes an in-memory cache to prevent redundant API calls.
 * Completely removed hardcoded COMMON_LOCATIONS.
 */

const locationCache = new Map();

/**
 * Reverse geocodes coordinates to a human-readable location with state and district.
 */
const reverseGeocode = async (latitude, longitude) => {
  const cacheKey = `rev_${Number(latitude).toFixed(4)}_${Number(longitude).toFixed(4)}`;
  if (locationCache.has(cacheKey)) {
    return locationCache.get(cacheKey);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
    console.error('Reverse Geocoding Error:', error.message);
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

  // Check cache
  if (locationCache.has(normalizedInput)) {
    return locationCache.get(normalizedInput);
  }

  try {
    // Add ", India" for Indian agriculture focus if not present
    const queryTerm = normalizedInput.includes('india') ? normalizedInput : `${normalizedInput}, India`;
    const query = encodeURIComponent(queryTerm);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
    console.error('Geocoding Error:', error.message);
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
