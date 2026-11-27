/**
 * IVR Configuration & DTMF Mappings
 * Maps DTMF digits to supported crops, quantities, and locations.
 */

const IVR_CROPS = {
  '1': { id: 'tomato', nameHi: 'टमाटर', nameEn: 'Tomato', varietyId: 'hybrid' },
  '2': { id: 'onion', nameHi: 'प्याज़', nameEn: 'Onion', varietyId: 'red' },
  '3': { id: 'potato', nameHi: 'आलू', nameEn: 'Potato', varietyId: 'jyoti' },
  '4': { id: 'wheat', nameHi: 'गेहूँ', nameEn: 'Wheat', varietyId: 'lokwan' }
};

const IVR_QUANTITIES = {
  '1': { kg: 400, labelHi: '400 किलो (4 क्विंटल)', labelEn: '400 kg' },
  '2': { kg: 800, labelHi: '800 किलो (8 क्विंटल)', labelEn: '800 kg' },
  '3': { kg: 1200, labelHi: '1200 किलो (12 क्विंटल)', labelEn: '1200 kg' },
  '4': { kg: 2000, labelHi: '2000 किलो (20 क्विंटल)', labelEn: '2000 kg' }
};

const IVR_LOCATIONS = {
  '1': { name: 'Nashik', nameHi: 'नासिक', state: 'Maharashtra', lat: 19.9975, lon: 73.7898 },
  '2': { name: 'Pune', nameHi: 'पुणे', state: 'Maharashtra', lat: 18.5204, lon: 73.8567 },
  '3': { name: 'Solapur', nameHi: 'सोलापुर', state: 'Maharashtra', lat: 17.6599, lon: 75.9064 },
  '4': { name: 'Nagpur', nameHi: 'नागपुर', state: 'Maharashtra', lat: 21.1458, lon: 79.0882 }
};

/**
 * Strips leading/trailing double or single quotes that Exotel adds around DTMF digits.
 * e.g. '"121"' -> '121'
 */
const sanitizeDigits = (val) => {
  if (val == null) return '';
  let str = String(val).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str;
};

module.exports = {
  IVR_CROPS,
  IVR_QUANTITIES,
  IVR_LOCATIONS,
  sanitizeDigits
};
