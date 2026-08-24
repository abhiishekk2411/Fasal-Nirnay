const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log("--- Testing IVR Endpoints ---");
  
  // Test Health
  try {
    const healthRes = await makeRequest({ hostname: 'localhost', port: 5000, path: '/api/ivr/health', method: 'GET' });
    console.log(`Health Route:`, healthRes.statusCode, healthRes.body);
  } catch (e) {
    console.error(`Health Route failed:`, e.message);
  }

  const testCases = [
    { name: "1. Tomato + 800 kg + Nashik", query: "?cropDigit=1&quantityDigit=2&locationDigit=1" },
    { name: "2. Onion + 800 kg + Nashik", query: "?cropDigit=2&quantityDigit=2&locationDigit=1" },
    { name: "3. Invalid crop choice", query: "?cropDigit=9&quantityDigit=2&locationDigit=1" },
    { name: "4. Invalid quantity", query: "?cropDigit=1&quantityDigit=9&locationDigit=1" },
    { name: "5. Missing location", query: "?cropDigit=1&quantityDigit=2" },
  ];

  console.log("\n--- Testing GET ---");
  for (const tc of testCases) {
    try {
      const res = await makeRequest({ hostname: 'localhost', port: 5000, path: `/api/ivr/analyze${tc.query}`, method: 'GET' });
      console.log(`${tc.name}:`, res.statusCode, res.body);
    } catch (e) {
      console.error(`${tc.name} failed:`, e.message);
    }
  }

  console.log("\n--- Testing POST ---");
  try {
    const payload = JSON.stringify({ cropDigit: "1", quantityDigit: "2", locationDigit: "1" });
    const resPost = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/ivr/analyze`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, payload);
    console.log(`POST Tomato + 800 kg + Nashik:`, resPost.statusCode, resPost.body);
  } catch (e) {
    console.error(`POST failed:`, e.message);
  }
}

runTests();
