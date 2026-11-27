/**
 * Automated test suite for POST /api/voice/parse
 */

require('dotenv').config({ path: __dirname + '/.env' });
process.env.NODE_ENV = 'test';

const http = require('http');
const assert = require('assert');
const app = require('./src/server');
const { parseDeterministic } = require('./src/controllers/voiceController');

function postJson(server, path, data) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = JSON.stringify(data);

    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body
          });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Voice Parser Test Suite ---');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Test 1: "20 quintal tamatar"
    console.log('Testing: 20 quintal tamatar...');
    const res1 = await postJson(server, '/api/voice/parse', { transcript: '20 quintal tamatar', language: 'hi' });
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.data.crop, 'Tomato');
    assert.strictEqual(res1.data.quantityQuintals, 20);
    assert.strictEqual(res1.data.needsClarification, false);
    assert.strictEqual(res1.data.clarificationPromptHindi, null);
    console.log('✓ Passed: 20 quintal tamatar ->', res1.data);

    // Test 2: "40 bori kanda" (40 * 0.5 = 20 quintals)
    console.log('Testing: 40 bori kanda...');
    const res2 = await postJson(server, '/api/voice/parse', { transcript: '40 bori kanda', language: 'hi' });
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.data.crop, 'Onion');
    assert.strictEqual(res2.data.quantityQuintals, 20);
    assert.strictEqual(res2.data.needsClarification, false);
    assert.strictEqual(res2.data.clarificationPromptHindi, null);
    console.log('✓ Passed: 40 bori kanda ->', res2.data);

    // Test 3: "1 bori aaloo" (1 * 0.5 = 0.5 quintals)
    console.log('Testing: 1 bori aaloo...');
    const res3 = await postJson(server, '/api/voice/parse', { transcript: '1 bori aaloo', language: 'hi' });
    assert.strictEqual(res3.statusCode, 200);
    assert.strictEqual(res3.data.crop, 'Potato');
    assert.strictEqual(res3.data.quantityQuintals, 0.5);
    assert.strictEqual(res3.data.needsClarification, false);
    console.log('✓ Passed: 1 bori aaloo ->', res3.data);

    // Test 4: "1 ton gehu" (1 ton = 10 quintals)
    console.log('Testing: 1 ton gehu...');
    const res4 = await postJson(server, '/api/voice/parse', { transcript: '1 ton gehu', language: 'hi' });
    assert.strictEqual(res4.statusCode, 200);
    assert.strictEqual(res4.data.crop, 'Wheat');
    assert.strictEqual(res4.data.quantityQuintals, 10);
    assert.strictEqual(res4.data.needsClarification, false);
    console.log('✓ Passed: 1 ton gehu ->', res4.data);

    // Test 5: "1000 kg dhan" (1000 kg = 10 quintals)
    console.log('Testing: 1000 kg dhan...');
    const res5 = await postJson(server, '/api/voice/parse', { transcript: '1000 kg dhan', language: 'hi' });
    assert.strictEqual(res5.statusCode, 200);
    assert.strictEqual(res5.data.crop, 'Paddy');
    assert.strictEqual(res5.data.quantityQuintals, 10);
    assert.strictEqual(res5.data.needsClarification, false);
    console.log('✓ Passed: 1000 kg dhan ->', res5.data);

    // Test 6: "100 kg tamatar" (100 kg = 1 quintal)
    console.log('Testing: 100 kg tamatar...');
    const res6 = await postJson(server, '/api/voice/parse', { transcript: '100 kg tamatar', language: 'hi' });
    assert.strictEqual(res6.statusCode, 200);
    assert.strictEqual(res6.data.crop, 'Tomato');
    assert.strictEqual(res6.data.quantityQuintals, 1);
    assert.strictEqual(res6.data.needsClarification, false);
    console.log('✓ Passed: 100 kg tamatar ->', res6.data);

    // Test 7: Missing quantity: "tamatar ka rate kya hai"
    console.log('Testing missing quantity: tamatar ka rate kya hai...');
    const res7 = await postJson(server, '/api/voice/parse', { transcript: 'tamatar ka rate kya hai', language: 'hi' });
    assert.strictEqual(res7.statusCode, 200);
    assert.strictEqual(res7.data.crop, 'Tomato');
    assert.strictEqual(res7.data.quantityQuintals, 1);
    assert.strictEqual(res7.data.needsClarification, true);
    assert.strictEqual(res7.data.clarificationPromptHindi, 'Ek quintal ke hisaab se bata raha hoon. Aapke paas kitna maal hai?');
    console.log('✓ Passed: missing quantity ->', res7.data);

    // Test 8: Missing quantity: "aloo ka kya bhav hai"
    console.log('Testing missing quantity: aloo ka kya bhav hai...');
    const res8 = await postJson(server, '/api/voice/parse', { transcript: 'aloo ka kya bhav hai', language: 'hi' });
    assert.strictEqual(res8.statusCode, 200);
    assert.strictEqual(res8.data.crop, 'Potato');
    assert.strictEqual(res8.data.quantityQuintals, 1);
    assert.strictEqual(res8.data.needsClarification, true);
    assert.strictEqual(res8.data.clarificationPromptHindi, 'Ek quintal ke hisaab se bata raha hoon. Aapke paas kitna maal hai?');
    console.log('✓ Passed: missing quantity aloo ->', res8.data);

    // Test 9: Deterministic fallback unit test
    console.log('Testing deterministic unit conversions directly...');
    const detPyaaz = parseDeterministic('chaalis bori pyaaz');
    assert.strictEqual(detPyaaz.crop, 'Onion');
    assert.strictEqual(detPyaaz.quantityQuintals, 20);

    const detGehu = parseDeterministic('gehu ka bhav batao');
    assert.strictEqual(detGehu.crop, 'Wheat');
    assert.strictEqual(detGehu.quantityQuintals, 1);
    assert.strictEqual(detGehu.needsClarification, true);
    assert.strictEqual(detGehu.clarificationPromptHindi, 'Ek quintal ke hisaab se bata raha hoon. Aapke paas kitna maal hai?');
    console.log('✓ Passed: deterministic fallback tests');

    console.log('\n========================================');
    console.log(' ALL VOICE PARSER TESTS PASSED (100%)');
    console.log('========================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
