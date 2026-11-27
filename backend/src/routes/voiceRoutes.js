const express = require('express');
const router = express.Router();
const { parseVoice } = require('../controllers/voiceController');

// POST /api/voice/parse
router.post('/parse', parseVoice);

module.exports = router;
