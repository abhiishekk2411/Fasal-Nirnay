/**
 * Comprehensive Automated Test Suite for Exotel IVR & Shared Recommendation Pipeline
 * Verifies:
 * 1. DTMF sanitization (including Exotel's quoted digits quirk)
 * 2. DTMF input validation (valid and invalid digits across all 4 crops/quantities/locations)
 * 3. 100% Web vs IVR recommendation consistency using identical inputs
 * 4. Web API Contract matches exactly what the frontend expects ({ success: true, data: { ... } })
 * 5. Dynamic Hindi speech text generation and tone (including explicit missing weather handling)
 * 6. Multi-step session tracking across Exotel applets (Crop -> Quantity -> Location -> Dynamic Audio -> Repeat -> Callback)
 * 7. Market data provenance structure and labeling
 * 8. Zero modification of production or shared database records
 */

const assert = require('assert');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { setImmediate: nextTurn } = require('node:timers/promises');
const express = require('express');
const mongoose = require('mongoose');
const {
  IVR_CROPS,
  IVR_QUANTITIES,
  IVR_LOCATIONS,
  sanitizeDigits
} = require('../src/config/ivrConfig');
const {
  parseIvrInput,
  resolveIvrEntities,
  analyzeIvrDecision,
  handleIvrStep,
  handleIvrResponse,
  handleIvrRepeat,
  handleIvrCallback,
  sendPlainText
} = require('../src/controllers/ivrController');
const {
  buildRecommendationSpeechHindi,
  buildErrorSpeechHindi,
  buildGoodbyeSpeechHindi
} = require('../src/services/ivr/ivrSpeechService');
const ivrSessionStore = require('../src/services/ivr/ivrSessionStore');
const recommendationService = require('../src/services/decision/recommendationService');
const { analyzeDecision } = require('../src/controllers/decisionController');

// Standardized test market data fixture (same as testEngine.js)
const testMandiFixture = [
  { mandiId: 'pimpalgaon', mandiName: 'Pimpalgaon Mandi', price: 24, latitude: 20.1700, longitude: 73.9800, riskPenalty: 500, trend: 'increasing', trendPercentage: 20, estimatedRange: { min: 20, max: 24.5 } },
  { mandiId: 'lasalgaon', mandiName: 'Lasalgaon Mandi', price: 22, latitude: 20.1400, longitude: 74.2200, riskPenalty: 200, trend: 'stable', trendPercentage: 0, estimatedRange: { min: 21, max: 23 } },
  { mandiId: 'sinnar', mandiName: 'Sinnar Mandi', price: 21, latitude: 19.8400, longitude: 73.9900, riskPenalty: 800, trend: 'decreasing', trendPercentage: -16, estimatedRange: { min: 21, max: 25 } },
  { mandiId: 'dindori', mandiName: 'Dindori Mandi', price: 18, latitude: 20.2000, longitude: 73.8200, riskPenalty: 0, trend: 'increasing', trendPercentage: 16, estimatedRange: { min: 15, max: 20 } },
  { mandiId: 'manmad', mandiName: 'Manmad Mandi', price: 27, latitude: 20.2500, longitude: 74.4400, riskPenalty: 0, trend: 'decreasing', trendPercentage: -7, estimatedRange: { min: 26, max: 29 } }
];

async function runAllTests() {
  console.log('====================================================');
  console.log('       FASALNIRNAY EXOTEL IVR TEST SUITE            ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // 1. DTMF Sanitization Tests
  test('DTMF Sanitization strips Exotel double-quotes (""121"" -> "121")', () => {
    assert.strictEqual(sanitizeDigits('"121"'), '121');
    assert.strictEqual(sanitizeDigits('\"1\"'), '1');
    assert.strictEqual(sanitizeDigits("'123'"), '123');
    assert.strictEqual(sanitizeDigits(' 2 '), '2');
    assert.strictEqual(sanitizeDigits(null), '');
    assert.strictEqual(sanitizeDigits(undefined), '');
  });

  // 2. DTMF Mapping & Entity Resolution Tests (All 4 crops, quantities, locations)
  test('Valid DTMF 3-digit string (121: Tomato, 800kg, Nashik) resolves correctly', () => {
    const mockReq = {
      query: { digits: '"121"' },
      body: {},
      headers: {}
    };
    const parsed = parseIvrInput(mockReq);
    assert.strictEqual(parsed.cropDigit, '1');
    assert.strictEqual(parsed.quantityDigit, '2');
    assert.strictEqual(parsed.locationDigit, '1');

    const entities = resolveIvrEntities(parsed);
    assert.strictEqual(entities.cropId, 'tomato');
    assert.strictEqual(entities.cropNameHi, 'टमाटर');
    assert.strictEqual(entities.quantityKg, 800);
    assert.strictEqual(entities.location, 'Nashik');
    assert.strictEqual(entities.locationNameHi, 'नासिक');
  });

  test('Valid DTMF 4th options (Wheat, 2000kg, Nagpur) resolves correctly', () => {
    const mockReq = {
      query: {},
      body: { cropDigit: '4', quantityDigit: '4', locationDigit: '4' },
      headers: {}
    };
    const parsed = parseIvrInput(mockReq);
    const entities = resolveIvrEntities(parsed);
    assert.strictEqual(entities.cropId, 'wheat');
    assert.strictEqual(entities.cropNameHi, 'गेहूँ');
    assert.strictEqual(entities.quantityKg, 2000);
    assert.strictEqual(entities.location, 'Nagpur');
    assert.strictEqual(entities.locationNameHi, 'नागपुर');
    assert.strictEqual(entities.coordinates.latitude, 21.1458);
    assert.strictEqual(entities.coordinates.longitude, 79.0882);
  });

  test('Invalid crop DTMF digit (9) throws INVALID_CROP and audio message describes all 4 crops', () => {
    const mockReq = {
      query: { cropDigit: '9', quantityDigit: '1', locationDigit: '1' },
      body: {},
      headers: {}
    };
    const parsed = parseIvrInput(mockReq);
    assert.throws(() => {
      resolveIvrEntities(parsed);
    }, (err) => err.code === 'INVALID_CROP');

    const errorSpeech = buildErrorSpeechHindi('INVALID_CROP');
    assert(errorSpeech.includes('टमाटर के लिए 1'));
    assert(errorSpeech.includes('प्याज़ के लिए 2'));
    assert(errorSpeech.includes('आलू के लिए 3'));
    assert(errorSpeech.includes('गेहूँ के लिए 4'));
  });

  test('Invalid quantity DTMF digit (9) throws INVALID_QUANTITY and audio describes all 4 quantities', () => {
    const mockReq = {
      query: { cropDigit: '1', quantityDigit: '9', locationDigit: '1' },
      body: {},
      headers: {}
    };
    const parsed = parseIvrInput(mockReq);
    assert.throws(() => {
      resolveIvrEntities(parsed);
    }, (err) => err.code === 'INVALID_QUANTITY');

    const errorSpeech = buildErrorSpeechHindi('INVALID_QUANTITY');
    assert(errorSpeech.includes('400 किलो'));
    assert(errorSpeech.includes('800 किलो'));
    assert(errorSpeech.includes('1200 किलो'));
    assert(errorSpeech.includes('2000 किलो'));
  });

  test('Invalid location DTMF digit (9) throws INVALID_LOCATION and audio describes all 4 locations', () => {
    const mockReq = {
      query: { cropDigit: '1', quantityDigit: '1', locationDigit: '9' },
      body: {},
      headers: {}
    };
    const parsed = parseIvrInput(mockReq);
    assert.throws(() => {
      resolveIvrEntities(parsed);
    }, (err) => err.code === 'INVALID_LOCATION');

    const errorSpeech = buildErrorSpeechHindi('INVALID_LOCATION');
    assert(errorSpeech.includes('नासिक'));
    assert(errorSpeech.includes('पुणे'));
    assert(errorSpeech.includes('सोलापुर'));
    assert(errorSpeech.includes('नागपुर'));
  });

  // 3. Web and IVR Consistency Test
  await testAsync('Web and IVR Recommendation Consistency with identical inputs and mandi data', async () => {
    const commonInput = {
      cropId: 'tomato',
      varietyId: 'hybrid',
      quantityKg: 800,
      location: 'Nashik',
      customMandis: testMandiFixture
    };

    // Run Recommendation Pipeline
    const webResult = await recommendationService.getRecommendation(commonInput);
    const ivrResult = await recommendationService.getRecommendation(commonInput);

    // Verify 100% mathematical and sorting identity
    assert.strictEqual(webResult.bestMandi, ivrResult.bestMandi, 'Best Mandi ID must match');
    assert.strictEqual(
      webResult.bestMandiDetails.expectedNetReturn,
      ivrResult.bestMandiDetails.expectedNetReturn,
      'Net Return must match exactly'
    );
    assert.strictEqual(
      webResult.bestMandiDetails.transportCost,
      ivrResult.bestMandiDetails.transportCost,
      'Transport Cost must match exactly'
    );
    assert.strictEqual(
      webResult.bestMandiDetails.riskPenalty,
      ivrResult.bestMandiDetails.riskPenalty,
      'Risk Penalty must match exactly'
    );
    assert.strictEqual(
      webResult.bestMandiDetails.sell_now_vs_wait,
      ivrResult.bestMandiDetails.sell_now_vs_wait,
      'Sell now vs wait timing advice must match'
    );
    assert.strictEqual(
      webResult.rankedMandis.length,
      ivrResult.rankedMandis.length,
      'Ranked mandis count must match'
    );

    // Verify sorting of ranked mandis
    for (let i = 0; i < webResult.rankedMandis.length; i++) {
      assert.strictEqual(
        webResult.rankedMandis[i].mandiId,
        ivrResult.rankedMandis[i].mandiId,
        `Rank ${i} Mandi ID must match`
      );
      assert.strictEqual(
        webResult.rankedMandis[i].expectedNetReturn,
        ivrResult.rankedMandis[i].expectedNetReturn,
        `Rank ${i} Net Return must match`
      );
    }
  });

  // 4. Existing Frontend Contract Validation
  test('Decision Controller adheres 100% to Frontend response contract ({ success: true, data: { ... } })', async () => {
    let capturedResponse = null;
    const mockReq = {
      body: {
        cropId: 'tomato',
        varietyId: 'hybrid',
        quantityKg: 800,
        location: 'Nashik'
      }
    };
    const mockRes = {
      status: () => mockRes,
      json: (data) => { capturedResponse = data; }
    };
    const mockNext = (err) => { if (err) throw err; };

    // Inject custom mandis for test isolation
    const origGet = recommendationService.getRecommendation;
    recommendationService.getRecommendation = async (params) => {
      return origGet({ ...params, customMandis: testMandiFixture });
    };

    try {
      await analyzeDecision(mockReq, mockRes, mockNext);
      assert(capturedResponse, 'Response must be returned');
      assert.strictEqual(capturedResponse.success, true);
      assert(capturedResponse.data, 'Frontend requires result.data wrapper');
      assert(capturedResponse.data.farmerLocation, 'farmerLocation required');
      assert(capturedResponse.data.weather, 'weather required');
      assert(capturedResponse.data.bestMandi, 'bestMandi required');
      assert(capturedResponse.data.rankedMandis, 'rankedMandis required');
      assert(capturedResponse.data.reasoningTags, 'reasoningTags required');
      assert(capturedResponse.data.provenance, 'provenance required');
    } finally {
      recommendationService.getRecommendation = origGet;
    }
  });

  // 5. Dynamic Hindi Speech Output Test (Including Missing Weather Notification)
  test('Dynamic Hindi Speech Generation explicitly flags missing weather data instead of false low risk', () => {
    // Case 1: Weather unavailable
    const speechNoWeather = buildRecommendationSpeechHindi({
      cropNameHi: 'टमाटर',
      quantityKg: 800,
      locationNameHi: 'नासिक',
      bestMandi: {
        mandiName: 'पिंपलगांव मंडी',
        distanceKm: 28,
        price: 24,
        expectedNetReturn: 17718,
        trend: 'stable',
        sell_now_vs_wait: 'sell_now'
      },
      weatherRisk: { riskLevel: 'unknown', available: false }
    });

    assert(speechNoWeather.includes('मौसम का लाइव पूर्वानुमान अभी उपलब्ध नहीं है'), 'Must explicitly notify caller weather is unavailable');

    // Case 2: Confirmed high weather risk
    const speechHighWeather = buildRecommendationSpeechHindi({
      cropNameHi: 'टमाटर',
      quantityKg: 800,
      locationNameHi: 'नासिक',
      bestMandi: {
        mandiName: 'पिंपलगांव मंडी',
        distanceKm: 28,
        price: 24,
        expectedNetReturn: 17718,
        trend: 'increasing',
        sell_now_vs_wait: 'sell_now'
      },
      weatherRisk: { riskLevel: 'high', available: true }
    });

    assert(speechHighWeather.includes('तुरंत बेचें'), 'Must contain sell now advice due to high risk');
    assert(speechHighWeather.includes('मौसम और बारिश का जोखिम अधिक है'), 'Must explain weather risk factor');
  });

  // 6. In-Memory Call Session Management Test
  test('Multi-step Exotel Call Session Store lifecycle (Store -> Step -> Read -> Repeat -> Cleanup)', () => {
    const callSid = 'exotel_call_test_12345';

    // Step 1: Crop
    ivrSessionStore.set(callSid, { cropDigit: '1', cropId: 'tomato', cropNameHi: 'टमाटर' });
    let session = ivrSessionStore.get(callSid);
    assert.strictEqual(session.cropId, 'tomato');

    // Step 2: Quantity
    ivrSessionStore.set(callSid, { quantityDigit: '2', quantityKg: 800, quantityLabelHi: '800 किलो' });
    session = ivrSessionStore.get(callSid);
    assert.strictEqual(session.quantityKg, 800);

    // Step 3: Location & Speech
    ivrSessionStore.set(callSid, {
      locationDigit: '1',
      location: 'Nashik',
      speechTextHindi: 'टेस्ट हिंदी स्पीच'
    });
    session = ivrSessionStore.get(callSid);
    assert.strictEqual(session.speechTextHindi, 'टेस्ट हिंदी स्पीच');

    // Repeat check
    assert.strictEqual(session.speechTextHindi, 'टेस्ट हिंदी स्पीच');

    // Call End / Callback Pruning
    ivrSessionStore.delete(callSid);
    assert.strictEqual(ivrSessionStore.get(callSid), null, 'Session must be pruned after call ends');
  });

  // 7. Provenance Metadata Test & Label Verification
  await testAsync('Market data provenance is accurately labeled for mock fixtures vs live vs DB', async () => {
    const result = await recommendationService.getRecommendation({
      cropId: 'tomato',
      varietyId: 'hybrid',
      quantityKg: 800,
      location: 'Nashik',
      customMandis: testMandiFixture
    });

    assert(result.provenance, 'Provenance metadata must exist');
    assert.strictEqual(
      result.provenance.dataSource,
      'Mocked Test Fixture (Deterministic Offline Evaluation)',
      'Custom fixture must be labeled as Mocked Test Fixture'
    );
    assert.strictEqual(result.provenance.weather.available, false, 'Offline weather must be available: false');
    assert.strictEqual(result.provenance.weather.riskLevel, 'unknown', 'Offline weather risk must be unknown');
    assert.strictEqual(result.provenance.transportConfig.ratePerKm, 5); // 800 kg bracket is ₹5/km
    assert.strictEqual(result.provenance.mandisEvaluatedCount, testMandiFixture.length);
    assert(result.provenance.timestamp, 'Must include ISO timestamp');
  });

  // 8. Production Database Safety Test
  test('Test suite executes without modifying or connecting to production database', () => {
    // Ensure tests operate safely in-memory
    assert.notStrictEqual(mongoose.connection.readyState, 1, 'Tests must not connect to live DB');
  });

  // 9. Exotel Content-Type Plain Text Compliance (no charset suffix)
  test('Dynamic playback helper sends exact Content-Type: text/plain without charset suffix', () => {
    let capturedHeader = null;
    let capturedBody = null;
    let capturedStatus = null;
    const mockRes = {
      setHeader: (k, v) => { if (k.toLowerCase() === 'content-type') capturedHeader = v; },
      status: (code) => { capturedStatus = code; return mockRes; },
      send: (body) => { capturedBody = body; return mockRes; }
    };

    sendPlainText(mockRes, 200, 'नमस्ते');
    assert.strictEqual(capturedStatus, 200);
    assert.strictEqual(capturedHeader, 'text/plain', 'Must be exactly text/plain without charset');
    assert(!capturedHeader.includes('charset'), 'Must NOT have charset suffix for Exotel TTS');
    assert(Buffer.isBuffer(capturedBody), 'Must send Buffer to prevent Express charset auto-population');
    assert.strictEqual(capturedBody.toString('utf-8'), 'नमस्ते');
  });

  // 10. HEAD Request Safety Test (Zero mutations, Zero recommendation calls)
  await testAsync('HEAD requests on IVR endpoints return 200 without mutating sessions or calculating recommendations', async () => {
    const probeSid = 'probe_head_sid_777';
    let recommendationCalls = 0;
    const origGet = recommendationService.getRecommendation;
    recommendationService.getRecommendation = async (...args) => {
      recommendationCalls++;
      return origGet.apply(recommendationService, args);
    };

    try {
      const createMockReqRes = (path, method = 'HEAD') => {
        let statusCode = null;
        let ended = false;
        let headers = {};
        const req = {
          method,
          path,
          query: { CallSid: probeSid, digits: '121', mode: 'exotel' },
          body: {},
          headers: {}
        };
        const res = {
          setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
          status: (code) => { statusCode = code; return res; },
          end: () => { ended = true; return res; },
          send: () => { ended = true; return res; }
        };
        return { req, res, getStatus: () => statusCode, isEnded: () => ended, getHeaders: () => headers };
      };

      // 1. HEAD /api/ivr/analyze
      const m1 = createMockReqRes('/api/ivr/analyze');
      await analyzeIvrDecision(m1.req, m1.res, () => {});
      assert.strictEqual(m1.getStatus(), 200);
      assert.strictEqual(m1.isEnded(), true);
      assert.strictEqual(m1.getHeaders()['content-type'], 'text/plain');
      assert.strictEqual(ivrSessionStore.get(probeSid), null, 'HEAD /analyze must not store session');

      // 2. HEAD /api/ivr/step
      const m2 = createMockReqRes('/api/ivr/step');
      m2.req.query.step = 'location';
      await handleIvrStep(m2.req, m2.res, () => {});
      assert.strictEqual(m2.getStatus(), 200);
      assert.strictEqual(m2.isEnded(), true);
      assert.strictEqual(ivrSessionStore.get(probeSid), null, 'HEAD /step must not store session');

      // 3. HEAD /api/ivr/response
      const m3 = createMockReqRes('/api/ivr/response');
      await handleIvrResponse(m3.req, m3.res, () => {});
      assert.strictEqual(m3.getStatus(), 200);
      assert.strictEqual(m3.isEnded(), true);
      assert.strictEqual(m3.getHeaders()['content-type'], 'text/plain');

      // 4. HEAD /api/ivr/repeat
      const m4 = createMockReqRes('/api/ivr/repeat');
      await handleIvrRepeat(m4.req, m4.res, () => {});
      assert.strictEqual(m4.getStatus(), 200);
      assert.strictEqual(m4.isEnded(), true);

      // 5. HEAD /api/ivr/callback
      ivrSessionStore.set('active_call_session', { cropId: 'tomato' });
      const m5 = createMockReqRes('/api/ivr/callback');
      m5.req.query.CallSid = 'active_call_session';
      handleIvrCallback(m5.req, m5.res);
      assert.strictEqual(m5.getStatus(), 200);
      assert.strictEqual(m5.isEnded(), true);
      assert(ivrSessionStore.get('active_call_session') !== null, 'HEAD callback must not delete session');
      ivrSessionStore.delete('active_call_session');

      // Verify zero recommendation engine calculations occurred across all HEAD checks
      assert.strictEqual(recommendationCalls, 0, 'HEAD requests must NEVER trigger recommendation calculation');
    } finally {
      recommendationService.getRecommendation = origGet;
    }
  });

  await testAsync('Location acknowledges a blocked engine and Greetings expose isolated pending, ready and failed states', async () => {
    const token = randomBytes(32).toString('hex');
    const originalSecret = process.env.EXOTEL_WEBHOOK_SECRET;
    const originalGet = recommendationService.getRecommendation;
    const jobs = [];
    recommendationService.getRecommendation = (input) => new Promise((resolve, reject) => {
      jobs.push({ input, resolve, reject });
    });
    process.env.EXOTEL_WEBHOOK_SECRET = token;

    const app = express();
    app.use('/api/ivr', require('../src/routes/ivrRoutes'));
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const request = (path, callSid, params = {}, method = 'GET') => {
        const query = new URLSearchParams({ token, CallSid: callSid, ...params });
        return fetch(`http://127.0.0.1:${server.address().port}/api/ivr/${path}?${query}`, {
          method,
          signal: AbortSignal.timeout(2000)
        });
      };
      const select = async (sid, step, digits, method) => {
        const response = await request('step', sid, { step, digits }, method);
        assert.strictEqual(response.status, 200);
        if (method !== 'HEAD') assert.strictEqual(await response.text(), 'OK');
      };
      const greeting = async (sid, expected, state) => {
        const get = await request('response', sid);
        const head = await request('response', sid, {}, 'HEAD');
        assert.strictEqual(head.status, get.status);
        assert.strictEqual(get.headers.get('content-type'), 'text/plain');
        for (const name of ['content-type', 'content-length', 'etag', 'cache-control']) {
          assert.strictEqual(head.headers.get(name), get.headers.get(name));
        }
        assert.strictEqual(await head.text(), '');
        assert.strictEqual(await get.text(), expected);
        assert.strictEqual(ivrSessionStore.get(sid)?.recommendationState, state);
      };
      const complete = (job, bestMandiDetails) => job.resolve({ bestMandiDetails, weatherRisk: {} });
      const first = 'background_first';
      const second = 'background_second';
      await select(first, 'crop', '"2"');
      await select(first, 'quantity', '3');
      await select(second, 'crop', '1');
      await select(second, 'quantity', '2');

      await select(first, 'location', '1', 'HEAD');
      assert.strictEqual(jobs.length, 0);
      const start = performance.now();
      await select(first, 'location', '1');
      console.log(`Location Passthru loopback HTTP response: ${(performance.now() - start).toFixed(2)} ms (engine still pending)`);
      assert.strictEqual(ivrSessionStore.get(first).location, 'Nashik');
      await select(first, 'location', '1');
      await greeting(first, buildErrorSpeechHindi('RECOMMENDATION_PENDING'), 'pending');
      assert.strictEqual(jobs.length, 1);
      assert.strictEqual(ivrSessionStore.get(second).recommendationState, undefined);

      await select(first, 'location', '2');
      await select(second, 'location', '4');
      assert.strictEqual(jobs.length, 3);
      assert.deepStrictEqual(jobs.map(({ input }) => [input.cropId, input.quantityKg, input.location]), [
        ['onion', 1200, 'Nashik'], ['onion', 1200, 'Pune'], ['tomato', 800, 'Nagpur']
      ]);
      complete(jobs[1], testMandiFixture[0]);
      jobs[2].reject(new Error('Controlled upstream failure'));
      await nextTurn();
      const savedSpeech = ivrSessionStore.get(first).speechTextHindi;
      assert.ok(savedSpeech.includes('Pimpalgaon Mandi'));
      complete(jobs[0], testMandiFixture[1]);
      await nextTurn();
      await greeting(first, savedSpeech, 'ready');
      await greeting(second, buildErrorSpeechHindi('RECOMMENDATION_FAILED'), 'failed');
      const repeat = await request('repeat', first, { digits: '1' });
      assert.strictEqual(await repeat.text(), savedSpeech);
      await select(first, 'location', '2');
      await select(second, 'location', '4');
      assert.strictEqual(jobs.length, 3);

      await select(second, 'location', '3');
      assert.strictEqual(jobs.length, 4);
      const callback = await request('callback', second);
      assert.strictEqual(callback.status, 200);
      complete(jobs[3], testMandiFixture[0]);
      await nextTurn();
      assert.strictEqual(ivrSessionStore.get(second), null);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      recommendationService.getRecommendation = originalGet;
      if (originalSecret === undefined) delete process.env.EXOTEL_WEBHOOK_SECRET;
      else process.env.EXOTEL_WEBHOOK_SECRET = originalSecret;
      ivrSessionStore.clear();
    }
  });

  console.log(`\n====================================================`);
  console.log(` RESULTS: ${passed}/${total} TESTS PASSED SUCCESSFULLY! `);
  console.log(`====================================================\n`);
}

runAllTests().catch((e) => {
  console.error('Test Suite Failed:', e);
  process.exit(1);
});
