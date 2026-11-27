const express = require('express');
const multer = require('multer');
const { createHash, timingSafeEqual } = require('node:crypto');
const router = express.Router();
const {
  analyzeIvrDecision,
  handleIvrStep,
  handleIvrResponse,
  handleIvrRepeat,
  handleIvrCallback
} = require('../controllers/ivrController');

// Exotel applets use configured URLs, so accept the shared secret in the query.
const digest = (value) => createHash('sha256').update(value).digest();
const windowMs = 60_000;
const requestLimit = 120;
let windowEnds = 0;
let requestCount = 0;

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const secret = process.env.EXOTEL_WEBHOOK_SECRET;
  const token = req.query.token;
  if (!secret) return res.status(503).end();
  if (typeof token !== 'string' || !timingSafeEqual(digest(secret), digest(token))) {
    return res.status(401).end();
  }

  const now = Date.now();
  if (now >= windowEnds) {
    windowEnds = now + windowMs;
    requestCount = 0;
  }
  if (requestCount >= requestLimit) {
    res.set('Retry-After', String(Math.ceil((windowEnds - now) / 1000)));
    return res.status(429).end();
  }
  requestCount += 1;
  next();
});

// Debug health route
router.get('/health', (req, res) => res.json({
  success: true,
  service: 'ivr',
  supportedEndpoints: [
    '/api/ivr/analyze',
    '/api/ivr/step',
    '/api/ivr/response',
    '/api/ivr/repeat',
    '/api/ivr/callback'
  ]
}));

// Main Exotel Passthru / Analysis endpoint (Supports GET, POST, HEAD)
router.get('/analyze', analyzeIvrDecision);
router.post('/analyze', analyzeIvrDecision);
router.head('/analyze', analyzeIvrDecision);

// Multi-step applet Passthru (step=crop|quantity|location)
router.get('/step', handleIvrStep);
router.post('/step', handleIvrStep);
router.head('/step', handleIvrStep);

// Exotel Dynamic Greeting / TTS playback endpoint (Supports GET, POST, HEAD as required by Exotel)
router.get('/response', handleIvrResponse);
router.post('/response', handleIvrResponse);
router.head('/response', handleIvrResponse);

// Exotel Repeat Menu endpoint
router.get('/repeat', handleIvrRepeat);
router.post('/repeat', handleIvrRepeat);
router.head('/repeat', handleIvrRepeat);

// Exotel Call Status Callback webhook
router.get('/callback', handleIvrCallback);
router.post('/callback', multer({
  limits: { fields: 20, fieldSize: 4096, files: 0 }
}).none(), handleIvrCallback);
router.head('/callback', handleIvrCallback);

module.exports = router;
