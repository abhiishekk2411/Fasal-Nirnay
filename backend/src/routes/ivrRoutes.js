const express = require('express');
const router = express.Router();
const {
  analyzeIvrDecision,
  handleIvrStep,
  handleIvrResponse,
  handleIvrRepeat,
  handleIvrCallback
} = require('../controllers/ivrController');

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
router.post('/callback', handleIvrCallback);
router.head('/callback', handleIvrCallback);

module.exports = router;
