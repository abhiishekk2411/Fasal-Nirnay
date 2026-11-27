const recommendationService = require('../services/decision/recommendationService');
const ivrSessionStore = require('../services/ivr/ivrSessionStore');
const {
  buildRecommendationSpeechHindi,
  buildErrorSpeechHindi,
  buildGoodbyeSpeechHindi
} = require('../services/ivr/ivrSpeechService');
const {
  IVR_CROPS,
  IVR_QUANTITIES,
  IVR_LOCATIONS,
  sanitizeDigits
} = require('../config/ivrConfig');

/**
 * Extracts and maps IVR input parameters from query and body.
 */
const parseIvrInput = (req) => {
  const data = { ...req.query, ...req.body };

  const sid = data.CallSid || data.callSid || data.CallSID;
  const callSid = typeof sid === 'string' && /^[\w-]{1,128}$/.test(sid) ? sid : null;
  const fromNumber = data.From || data.from || data.CallFrom || null;
  const rawDigits = sanitizeDigits(data.digits || data.Digits || data.digit || '');

  let cropDigit = sanitizeDigits(data.cropDigit || data.crop_digit || '');
  let quantityDigit = sanitizeDigits(data.quantityDigit || data.quantity_digit || '');
  let locationDigit = sanitizeDigits(data.locationDigit || data.location_digit || '');

  // If a multi-digit string was gathered by Exotel (e.g. digits="121")
  if (rawDigits.length >= 3) {
    cropDigit = rawDigits[0];
    quantityDigit = rawDigits[1];
    locationDigit = rawDigits[2];
  } else if (rawDigits.length === 1 && !cropDigit) {
    cropDigit = rawDigits;
  }

  // Allow direct string/numeric names for web or API testing (e.g. crop=tomato)
  const directCrop = data.crop || data.cropId;
  const directQuantity = data.quantity || data.quantityKg;
  const directLocation = data.location;
  const directVariety = data.variety || data.varietyId;

  return {
    callSid,
    fromNumber,
    rawDigits,
    cropDigit,
    quantityDigit,
    locationDigit,
    directCrop,
    directQuantity,
    directLocation,
    directVariety,
    mode: data.mode,
    step: data.step,
    isExotelMode: data.mode === 'exotel' || (req.headers.accept && req.headers.accept.includes('text/plain'))
  };
};

/**
 * Resolves inputs into validated domain entities using IVR DTMF config.
 */
const resolveIvrEntities = (parsed) => {
  let cropId, cropNameHi, varietyId;
  let quantityKg, quantityLabelHi;
  let location, locationNameHi, coordinates;

  // 1. Resolve Crop
  if (parsed.cropDigit) {
    const cropConfig = IVR_CROPS[parsed.cropDigit];
    if (!Object.hasOwn(IVR_CROPS, parsed.cropDigit)) {
      const err = new Error('Invalid crop choice. Press 1 for Tomato, 2 for Onion, 3 for Potato, 4 for Wheat.');
      err.code = 'INVALID_CROP';
      err.statusCode = 400;
      throw err;
    }
    cropId = cropConfig.id;
    cropNameHi = cropConfig.nameHi;
    varietyId = cropConfig.varietyId;
  } else if (parsed.directCrop) {
    cropId = String(parsed.directCrop).toLowerCase();
    const matchedCrop = Object.values(IVR_CROPS).find(c => c.id === cropId);
    cropNameHi = matchedCrop ? matchedCrop.nameHi : cropId;
    varietyId = parsed.directVariety || (matchedCrop ? matchedCrop.varietyId : 'hybrid');
  }

  // 2. Resolve Quantity
  if (parsed.quantityDigit) {
    const qtyConfig = IVR_QUANTITIES[parsed.quantityDigit];
    if (!Object.hasOwn(IVR_QUANTITIES, parsed.quantityDigit)) {
      const err = new Error('Invalid quantity choice. Press 1 for 400kg, 2 for 800kg, 3 for 1200kg, 4 for 2000kg.');
      err.code = 'INVALID_QUANTITY';
      err.statusCode = 400;
      throw err;
    }
    quantityKg = qtyConfig.kg;
    quantityLabelHi = qtyConfig.labelHi;
  } else if (parsed.directQuantity != null) {
    const parsedQty = parseFloat(parsed.directQuantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      const err = new Error('Invalid quantity provided. Must be a positive number.');
      err.code = 'INVALID_QUANTITY';
      err.statusCode = 400;
      throw err;
    }
    quantityKg = parsedQty;
    quantityLabelHi = `${parsedQty} किलो`;
  }

  // 3. Resolve Location (Default to Nashik if digit omitted)
  if (parsed.locationDigit) {
    const locConfig = IVR_LOCATIONS[parsed.locationDigit];
    if (!Object.hasOwn(IVR_LOCATIONS, parsed.locationDigit)) {
      const err = new Error('Invalid location choice. Press 1 for Nashik, 2 for Pune, 3 for Solapur, 4 for Nagpur.');
      err.code = 'INVALID_LOCATION';
      err.statusCode = 400;
      throw err;
    }
    location = locConfig.name;
    locationNameHi = locConfig.nameHi;
    coordinates = { latitude: locConfig.lat, longitude: locConfig.lon };
  } else if (parsed.directLocation) {
    location = String(parsed.directLocation).trim();
    const matchedLoc = Object.values(IVR_LOCATIONS).find(l => l.name.toLowerCase() === location.toLowerCase());
    locationNameHi = matchedLoc ? matchedLoc.nameHi : location;
    if (matchedLoc) {
      coordinates = { latitude: matchedLoc.lat, longitude: matchedLoc.lon };
    }
  } else {
    // Graceful default for IVR demo
    location = IVR_LOCATIONS['1'].name;
    locationNameHi = IVR_LOCATIONS['1'].nameHi;
    coordinates = { latitude: IVR_LOCATIONS['1'].lat, longitude: IVR_LOCATIONS['1'].lon };
  }

  return {
    cropId,
    cropNameHi,
    varietyId,
    quantityKg,
    quantityLabelHi,
    location,
    locationNameHi,
    coordinates
  };
};

/**
 * Sends a plain text response with Content-Type: text/plain (no charset suffix).
 * Passing a Buffer prevents Express from automatically appending '; charset=utf-8'.
 * Required by Exotel Dynamic Greeting TTS URL specification.
 */
const sendPlainText = (res, statusCode, text) => {
  res.setHeader('Content-Type', 'text/plain');
  return res.status(statusCode).send(Buffer.from(String(text), 'utf-8'));
};

/**
 * @desc    Main IVR Analysis Handler (GET/POST /api/ivr/analyze)
 *          Can return structured JSON or text/plain for Exotel Dynamic TTS.
 */
const analyzeIvrDecision = async (req, res, next) => {
  const parsed = parseIvrInput(req);

  // Exotel HEAD probe check - do not mutate session or trigger calculations
  if (req.method === 'HEAD') {
    if (parsed.isExotelMode) {
      res.setHeader('Content-Type', 'text/plain');
    } else {
      res.setHeader('Content-Type', 'application/json');
    }
    return res.status(200).end();
  }

  try {
    const entities = resolveIvrEntities(parsed);

    if (!entities.cropId) {
      const err = new Error('Missing crop selection.');
      err.code = 'INVALID_CROP';
      err.statusCode = 400;
      throw err;
    }

    if (!entities.quantityKg) {
      const err = new Error('Missing quantity selection.');
      err.code = 'INVALID_QUANTITY';
      err.statusCode = 400;
      throw err;
    }

    // Call unified recommendation pipeline
    const result = await recommendationService.getRecommendation({
      cropId: entities.cropId,
      varietyId: entities.varietyId,
      quantityKg: entities.quantityKg,
      location: entities.location,
      coordinates: entities.coordinates
    });

    const bestMandi = result.bestMandiDetails;

    // Generate dynamic Hindi speech script for Exotel TTS
    const speechTextHindi = buildRecommendationSpeechHindi({
      cropNameHi: entities.cropNameHi,
      quantityKg: entities.quantityKg,
      locationNameHi: entities.locationNameHi,
      bestMandi,
      weatherRisk: result.weatherRisk
    });

    // Store in session if CallSid is present
    if (parsed.callSid) {
      ivrSessionStore.set(parsed.callSid, {
        ...entities,
        recommendation: result,
        speechTextHindi,
        recommendationState: 'ready',
        fromNumber: parsed.fromNumber
      });
    }

    // Return plain text if Exotel mode or text/plain requested
    if (parsed.isExotelMode) {
      return sendPlainText(res, 200, speechTextHindi);
    }

    // Return rich structured JSON for web/API consumers
    return res.status(200).json({
      success: true,
      callSid: parsed.callSid,
      inputs: {
        crop: entities.cropId,
        cropHindi: entities.cropNameHi,
        variety: entities.varietyId,
        quantityKg: entities.quantityKg,
        quantityLabel: entities.quantityLabelHi,
        location: entities.location,
        locationHindi: entities.locationNameHi
      },
      recommendation: {
        bestMandi: bestMandi.mandiName,
        pricePerKg: bestMandi.price,
        distanceKm: bestMandi.distanceKm,
        transportCost: bestMandi.transportCost,
        riskPenalty: bestMandi.riskPenalty,
        expectedRevenue: bestMandi.expectedRevenue,
        expectedNetReturn: bestMandi.expectedNetReturn,
        sellNow: bestMandi.sell_now_vs_wait === 'sell_now',
        timingAdvice: bestMandi.sell_now_vs_wait,
        trend: bestMandi.trend,
        weatherRisk: result.weatherRisk.riskLevel
      },
      speechTextHindi,
      rankedMandis: result.rankedMandis,
      provenance: result.provenance
    });

  } catch (error) {
    console.error('[IVR] Controller Error:', error.message);
    const speechError = buildErrorSpeechHindi(error.code || 'default');

    if (parsed.isExotelMode) {
      return sendPlainText(res, error.statusCode || 200, speechError);
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'IVR_ERROR',
      message: error.message,
      speechTextHindi: speechError
    });
  }
};

const calculateSessionRecommendation = async (callSid, session) => {
  if (ivrSessionStore.get(callSid) !== session) return;

  try {
    const result = await recommendationService.getRecommendation({
      cropId: session.cropId,
      varietyId: session.varietyId,
      quantityKg: session.quantityKg,
      location: session.location,
      coordinates: session.coordinates
    });
    const speechTextHindi = buildRecommendationSpeechHindi({
      cropNameHi: session.cropNameHi,
      quantityKg: session.quantityKg,
      locationNameHi: session.locationNameHi,
      bestMandi: result.bestMandiDetails,
      weatherRisk: result.weatherRisk
    });

    // A later selection, expiration, or callback may have replaced this session.
    if (ivrSessionStore.get(callSid) === session) {
      ivrSessionStore.set(callSid, {
        recommendation: result,
        recommendationState: 'ready',
        speechTextHindi,
        step: 'recommendation_ready'
      });
    }
  } catch {
    if (ivrSessionStore.get(callSid) === session) {
      ivrSessionStore.set(callSid, { recommendationState: 'failed' });
      console.error('[IVR] Background recommendation failed.');
    }
  }
};

/**
 * @desc    Multi-step IVR Passthru handler (GET/POST /api/ivr/step)
 *          Allows multi-applet flow (Crop -> Quantity -> Location) with session tracking.
 */
const handleIvrStep = async (req, res, next) => {
  const parsed = parseIvrInput(req);
  const { callSid, step, rawDigits } = parsed;

  // Exotel HEAD probe check - do not mutate session or trigger calculations
  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).end();
  }

  if (!callSid) {
    return res.status(400).json({
      success: false,
      message: 'CallSid is required for step-by-step IVR tracking.'
    });
  }

  try {
    const session = ivrSessionStore.get(callSid);

    if (step === 'crop') {
      const cropDigit = rawDigits || parsed.cropDigit;
      const cropConfig = IVR_CROPS[cropDigit];
      if (!Object.hasOwn(IVR_CROPS, cropDigit)) {
        return sendPlainText(res, 400, buildErrorSpeechHindi('INVALID_CROP'));
      }
      if (session?.cropDigit === cropDigit) {
        return sendPlainText(res, 200, 'OK');
      }
      ivrSessionStore.set(callSid, {
        cropDigit,
        cropId: cropConfig.id,
        cropNameHi: cropConfig.nameHi,
        varietyId: cropConfig.varietyId,
        quantityKg: undefined,
        recommendationState: undefined,
        recommendation: undefined,
        speechTextHindi: undefined,
        step: 'crop_selected'
      });
      return sendPlainText(res, 200, 'OK');
    }

    if (step === 'quantity') {
      const quantityDigit = rawDigits || parsed.quantityDigit;
      const qtyConfig = IVR_QUANTITIES[quantityDigit];
      if (!Object.hasOwn(IVR_QUANTITIES, quantityDigit)) {
        return sendPlainText(res, 400, buildErrorSpeechHindi('INVALID_QUANTITY'));
      }
      if (!session?.cropId) {
        return sendPlainText(res, 409, buildErrorSpeechHindi('SESSION_UNAVAILABLE'));
      }
      if (session.quantityKg && session.quantityDigit === quantityDigit) {
        return sendPlainText(res, 200, 'OK');
      }
      ivrSessionStore.set(callSid, {
        quantityDigit,
        quantityKg: qtyConfig.kg,
        quantityLabelHi: qtyConfig.labelHi,
        recommendationState: undefined,
        recommendation: undefined,
        speechTextHindi: undefined,
        step: 'quantity_selected'
      });
      return sendPlainText(res, 200, 'OK');
    }

    if (step === 'location') {
      const locationDigit = rawDigits || parsed.locationDigit;
      if (!Object.hasOwn(IVR_LOCATIONS, locationDigit)) {
        return sendPlainText(res, 400, buildErrorSpeechHindi('INVALID_LOCATION'));
      }
      if (!session?.cropId || !session.quantityKg) {
        return sendPlainText(res, 409, buildErrorSpeechHindi('SESSION_UNAVAILABLE'));
      }
      if (session.locationDigit === locationDigit && session.recommendationState) {
        return sendPlainText(res, 200, 'OK');
      }
      const locConfig = IVR_LOCATIONS[locationDigit];
      const current = ivrSessionStore.set(callSid, {
        locationDigit,
        location: locConfig.name,
        locationNameHi: locConfig.nameHi,
        coordinates: { latitude: locConfig.lat, longitude: locConfig.lon },
        recommendationState: 'pending',
        recommendation: undefined,
        speechTextHindi: undefined,
        step: 'location_selected'
      });

      setImmediate(calculateSessionRecommendation, callSid, current);
      return sendPlainText(res, 200, 'OK');
    }

    return res.status(400).json({ success: false, message: `Unknown step: ${step}` });
  } catch (error) {
    console.error('[IVR Step Error]:', error.message);
    return sendPlainText(res, error.statusCode || 500, buildErrorSpeechHindi(error.code || 'default'));
  }
};

/**
 * @desc    Exotel Dynamic Greeting / TTS URL endpoint (GET/POST /api/ivr/response)
 *          Serves plain text Hindi response for Exotel Greeting applet configured with dynamic URL.
 */
const handleIvrResponse = (req, res) => {
  const { callSid } = parseIvrInput(req);
  const session = ivrSessionStore.get(callSid);
  if (session?.recommendationState === 'pending') {
    return sendPlainText(res, 200, buildErrorSpeechHindi('RECOMMENDATION_PENDING'));
  }
  if (session?.recommendationState === 'failed') {
    return sendPlainText(res, 200, buildErrorSpeechHindi('RECOMMENDATION_FAILED'));
  }
  return sendPlainText(res, 200, session?.speechTextHindi || buildErrorSpeechHindi('SESSION_UNAVAILABLE'));
};

/**
 * @desc    Repeat the stored recommendation for digit 1, otherwise say goodbye.
 */
const handleIvrRepeat = (req, res) => {
  if (parseIvrInput(req).rawDigits === '1') {
    return handleIvrResponse(req, res);
  }
  return sendPlainText(res, 200, buildGoodbyeSpeechHindi());
};

/**
 * @desc    Exotel Call Status Webhook (POST/GET /api/ivr/callback)
 *          Cleans up session and records call completion metrics.
 */
const handleIvrCallback = (req, res) => {
  // Exotel HEAD probe check - do not mutate or delete session
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const parsed = parseIvrInput(req);
  const data = { ...req.query, ...req.body };

  if (parsed.callSid) {
    ivrSessionStore.delete(parsed.callSid);
    console.log(`[IVR Callback] CallSid ${parsed.callSid} completed. Status: ${data.Status || 'completed'}`);
  }

  return res.status(200).json({
    success: true,
    message: 'Exotel status callback received and session pruned.',
    callSid: parsed.callSid
  });
};

module.exports = {
  analyzeIvrDecision,
  handleIvrStep,
  handleIvrResponse,
  handleIvrRepeat,
  handleIvrCallback,
  parseIvrInput,
  resolveIvrEntities,
  sendPlainText
};
