/**
 * In-process & Real HTTP Integration Test for Exotel IVR Endpoints
 * Verifies:
 * 1. Real HTTP network responses and headers (Content-Type: text/plain without charset suffix)
 * 2. Exotel Dynamic Greeting TTS URL specification compliance
 * 3. HEAD requests do not mutate call sessions or trigger recommendations
 * 4. Multi-step session lifecycle and callback pruning
 */

process.env.NODE_ENV = 'test';

const http = require('http');
const assert = require('assert');
const app = require('./src/server');
const ivrSessionStore = require('./src/services/ivr/ivrSessionStore');
const recommendationService = require('./src/services/decision/recommendationService');

// Standardized test mandi fixture for deterministic offline test execution
const testMandiFixture = [
  { mandiId: 'pimpalgaon', mandiName: 'Pimpalgaon Mandi', price: 24, latitude: 20.1700, longitude: 73.9800, riskPenalty: 500, trend: 'increasing', trendPercentage: 20, estimatedRange: { min: 20, max: 24.5 } },
  { mandiId: 'lasalgaon', mandiName: 'Lasalgaon Mandi', price: 22, latitude: 20.1400, longitude: 74.2200, riskPenalty: 200, trend: 'stable', trendPercentage: 0, estimatedRange: { min: 21, max: 23 } },
  { mandiId: 'sinnar', mandiName: 'Sinnar Mandi', price: 21, latitude: 19.8400, longitude: 73.9900, riskPenalty: 800, trend: 'decreasing', trendPercentage: -16, estimatedRange: { min: 21, max: 25 } },
  { mandiId: 'dindori', mandiName: 'Dindori Mandi', price: 18, latitude: 20.2000, longitude: 73.8200, riskPenalty: 0, trend: 'increasing', trendPercentage: 16, estimatedRange: { min: 15, max: 20 } },
  { mandiId: 'manmad', mandiName: 'Manmad Mandi', price: 27, latitude: 20.2500, longitude: 74.4400, riskPenalty: 0, trend: 'decreasing', trendPercentage: -7, estimatedRange: { min: 26, max: 29 } }
];

/**
 * Real HTTP client helper using native http module
 */
function httpRequest(server, { method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address.port;

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'object' ? JSON.stringify(body) : String(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('      EXOTEL IVR REAL HTTP INTEGRATION TESTS        ');
  console.log('====================================================\n');

  // Inject offline test fixture for deterministic recommendation execution without live API/DB
  const origGet = recommendationService.getRecommendation;
  recommendationService.getRecommendation = async (params) => {
    return origGet.call(recommendationService, {
      ...params,
      customMandis: params.customMandis || testMandiFixture
    });
  };

  // Start HTTP server on an ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Ephemeral test server running at http://127.0.0.1:${port}\n`);

  try {
    // 1. Health Route
    const health = await httpRequest(server, { method: 'GET', path: '/api/ivr/health' });
    assert.strictEqual(health.statusCode, 200);
    assert(health.headers['content-type'].includes('application/json'));
    console.log(`[PASS] 1. Health Check [${health.statusCode}]: ${health.body}`);

    // 2. Exotel Mode - Verify Content-Type is exactly text/plain (NO charset suffix)
    const exotelAnalyze = await httpRequest(server, {
      method: 'GET',
      path: '/api/ivr/analyze?digits=121&mode=exotel'
    });
    assert.strictEqual(exotelAnalyze.statusCode, 200);
    assert.strictEqual(
      exotelAnalyze.headers['content-type'],
      'text/plain',
      `Exotel dynamic greeting requires exact 'text/plain', got: '${exotelAnalyze.headers['content-type']}'`
    );
    assert(!exotelAnalyze.headers['content-type'].includes('charset'), 'Must NOT have charset suffix');
    console.log(`[PASS] 2. Exotel Mode Analysis [${exotelAnalyze.statusCode}] Header: '${exotelAnalyze.headers['content-type']}' (exact text/plain without charset)`);

    // 3. Multi-step Flow (Crop -> Quantity -> Location)
    const sid = 'real_http_session_888';
    const s1 = await httpRequest(server, { method: 'GET', path: `/api/ivr/step?step=crop&digits=1&CallSid=${sid}` });
    assert.strictEqual(s1.statusCode, 200);
    assert.strictEqual(s1.headers['content-type'], 'text/plain');
    assert.strictEqual(s1.body, 'OK');

    const s2 = await httpRequest(server, { method: 'GET', path: `/api/ivr/step?step=quantity&digits=2&CallSid=${sid}` });
    assert.strictEqual(s2.statusCode, 200);
    assert.strictEqual(s2.headers['content-type'], 'text/plain');
    assert.strictEqual(s2.body, 'OK');

    const s3 = await httpRequest(server, { method: 'GET', path: `/api/ivr/step?step=location&digits=1&CallSid=${sid}` });
    assert.strictEqual(s3.statusCode, 200);
    assert.strictEqual(s3.headers['content-type'], 'text/plain');
    assert.strictEqual(s3.body, 'OK');
    console.log(`[PASS] 3. Multi-step Flow [${s1.statusCode}, ${s2.statusCode}, ${s3.statusCode}] All 'text/plain'`);

    // 4. Dynamic Playback Endpoint (/api/ivr/response)
    const resp = await httpRequest(server, { method: 'GET', path: `/api/ivr/response?CallSid=${sid}` });
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(
      resp.headers['content-type'],
      'text/plain',
      `Dynamic playback endpoint must return exact 'text/plain', got '${resp.headers['content-type']}'`
    );
    assert(!resp.headers['content-type'].includes('charset'), 'Must NOT contain charset suffix');
    assert(resp.body.includes('नमस्ते'), 'Must return valid Hindi speech script');
    console.log(`[PASS] 4. Dynamic Greeting TTS [${resp.statusCode}] Content-Type: '${resp.headers['content-type']}'`);
    console.log(`       Audio Prompt: "${resp.body.slice(0, 80)}..."`);

    // 5. Repeat Menu Playback Endpoint (/api/ivr/repeat)
    const repeat = await httpRequest(server, { method: 'GET', path: `/api/ivr/repeat?CallSid=${sid}&digits=1` });
    assert.strictEqual(repeat.statusCode, 200);
    assert.strictEqual(
      repeat.headers['content-type'],
      'text/plain',
      `Repeat endpoint must return exact 'text/plain', got '${repeat.headers['content-type']}'`
    );
    assert(!repeat.headers['content-type'].includes('charset'), 'Must NOT contain charset suffix');
    console.log(`[PASS] 5. Repeat Menu [${repeat.statusCode}] Content-Type: '${repeat.headers['content-type']}'`);

    // 6. HEAD Requests Must NOT Mutate Sessions or Trigger Recommendations
    const probeSid = 'probe_head_sid_999';

    // HEAD /api/ivr/analyze
    const headAnalyze = await httpRequest(server, { method: 'HEAD', path: `/api/ivr/analyze?digits=121&mode=exotel&CallSid=${probeSid}` });
    assert.strictEqual(headAnalyze.statusCode, 200);
    assert.strictEqual(headAnalyze.headers['content-type'], 'text/plain');
    assert.strictEqual(headAnalyze.body, '', 'HEAD request must return empty body');
    assert.strictEqual(ivrSessionStore.get(probeSid), null, 'HEAD /analyze must NOT create or mutate session');

    // HEAD /api/ivr/step
    const headStep = await httpRequest(server, { method: 'HEAD', path: `/api/ivr/step?step=crop&digits=1&CallSid=${probeSid}` });
    assert.strictEqual(headStep.statusCode, 200);
    assert.strictEqual(headStep.headers['content-type'], 'text/plain');
    assert.strictEqual(headStep.body, '', 'HEAD request must return empty body');
    assert.strictEqual(ivrSessionStore.get(probeSid), null, 'HEAD /step must NOT create or mutate session');

    // HEAD /api/ivr/response
    const headResponse = await httpRequest(server, { method: 'HEAD', path: `/api/ivr/response?CallSid=${probeSid}` });
    assert.strictEqual(headResponse.statusCode, 200);
    assert.strictEqual(headResponse.headers['content-type'], 'text/plain');
    assert.strictEqual(headResponse.body, '', 'HEAD request must return empty body');
    assert.strictEqual(ivrSessionStore.get(probeSid), null, 'HEAD /response must NOT create or mutate session');

    // HEAD /api/ivr/repeat
    const headRepeat = await httpRequest(server, { method: 'HEAD', path: `/api/ivr/repeat?CallSid=${probeSid}&digits=1` });
    assert.strictEqual(headRepeat.statusCode, 200);
    assert.strictEqual(headRepeat.headers['content-type'], 'text/plain');
    assert.strictEqual(headRepeat.body, '', 'HEAD request must return empty body');
    assert.strictEqual(ivrSessionStore.get(probeSid), null, 'HEAD /repeat must NOT create or mutate session');

    // HEAD /api/ivr/callback - must NOT delete existing sessions
    assert(ivrSessionStore.get(sid) !== null, 'Session sid must exist before HEAD callback');
    const headCallback = await httpRequest(server, { method: 'HEAD', path: `/api/ivr/callback?CallSid=${sid}` });
    assert.strictEqual(headCallback.statusCode, 200);
    assert.strictEqual(headCallback.body, '');
    assert(ivrSessionStore.get(sid) !== null, 'HEAD /callback must NOT delete active session');
    console.log(`[PASS] 6. HEAD Requests Tested across /analyze, /step, /response, /repeat, /callback (Zero mutations, 200 OK, empty bodies)`);

    // 7. Status Callback Prunes Session on Actual POST/GET
    const cb = await httpRequest(server, {
      method: 'POST',
      path: '/api/ivr/callback',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CallSid: sid, Status: 'completed' })
    });
    assert.strictEqual(cb.statusCode, 200);
    assert.strictEqual(ivrSessionStore.get(sid), null, 'Session must be pruned after actual callback');
    console.log(`[PASS] 7. Status Callback [${cb.statusCode}]: Session pruned cleanly`);

    // 8. Invalid DTMF Validation (Crop 9)
    const invalid = await httpRequest(server, {
      method: 'GET',
      path: '/api/ivr/analyze?cropDigit=9&quantityDigit=1&mode=exotel'
    });
    assert.strictEqual(invalid.statusCode, 400);
    assert.strictEqual(invalid.headers['content-type'], 'text/plain');
    assert(invalid.body.includes('अमान्य फसल'), 'Error speech returned');
    console.log(`[PASS] 8. Invalid Input Validation [${invalid.statusCode}]: Content-Type: 'text/plain'`);

    console.log('\n====================================================');
    console.log(' ALL EXOTEL INTEGRATION TESTS PASSED CLEANLY!       ');
    console.log('====================================================\n');

  } finally {
    recommendationService.getRecommendation = origGet;
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test Execution Failed:', err);
  process.exit(1);
});
