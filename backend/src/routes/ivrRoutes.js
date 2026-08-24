const express = require('express');
const router = express.Router();
const { analyzeIvrDecision } = require('../controllers/ivrController');

// Debug health route
router.get('/health', (req, res) => res.json({ success: true, service: 'ivr' }));

// Exotel usually supports POST and GET for passthru endpoints
router.post('/analyze', analyzeIvrDecision);
router.get('/analyze', analyzeIvrDecision);

module.exports = router;
