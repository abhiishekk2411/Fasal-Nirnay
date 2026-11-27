const mongoose = require('mongoose');
const DecisionHistory = require('../models/DecisionHistory');
const Mandi = require('../models/Mandi');
const MarketPrice = require('../models/MarketPrice');

/**
 * Handle incoming chat message with OpenRouter (google/gemini-2.5-flash)
 * @route POST /api/chat
 */
const handleChat = async (req, res, next) => {
  try {
    const { message, history = [], lang = 'hi', userId = 'demo_farmer_001' } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: lang === 'hi' ? 'संदेश खाली नहीं हो सकता।' : 'Message cannot be empty.'
      });
    }

    // 1. Gather live context from MongoDB
    let latestDecision = null;
    let nearbyMandis = [];
    let recentPrices = [];

    try {
      if (mongoose.connection.readyState === 1) {
        // Find user's latest analysis or the most recent one in the system
        if (userId) {
          latestDecision = await DecisionHistory.findOne({ userId })
            .sort({ createdAt: -1 })
            .lean();
        }

        if (!latestDecision) {
          latestDecision = await DecisionHistory.findOne()
            .sort({ createdAt: -1 })
            .lean();
        }

        nearbyMandis = await Mandi.find({ active: true }).limit(5).lean();
        recentPrices = await MarketPrice.find().sort({ date: -1 }).limit(10).lean();
      }
    } catch (dbErr) {
      console.warn('[Chat] DB Context Warning:', dbErr.message);
    }

    // 2. Format context for system prompt
    let contextSummary = lang === 'hi'
      ? 'कोई हालिया फसल विश्लेषण उपलब्ध नहीं है। किसान को /analyze पर फसल विश्लेषण करने को कहें।'
      : 'No recent crop analysis found. Ask farmer to perform an analysis on /analyze.';

    if (latestDecision) {
      contextSummary = `
किसान का हालिया विश्लेषण डेटा (Farmer's Latest Decision Context):
- फसल (Crop): ${latestDecision.cropId} (किस्म: ${latestDecision.varietyId})
- मात्रा (Quantity): ${latestDecision.quantityKg} kg
- किसान का स्थान (Location): ${latestDecision.farmerLocation}
- सुझाई गई सर्वश्रेष्ठ मंडी (Best Mandi): ${latestDecision.selectedMandiName}
- मंडी भाव (Mandi Price): ₹${latestDecision.selectedMandiPrice}/kg
- अनुमानित कुल राजस्व (Revenue): ₹${latestDecision.expectedRevenue}
- अनुमानित परिवहन खर्च (Transport Cost): ₹${latestDecision.transportCost}
- मौसम जोखिम कटौती (Risk Penalty): ₹${latestDecision.riskPenalty}
- अनुमानित शुद्ध लाभ (Expected Net Return): ₹${latestDecision.expectedNetReturn}
- भाव का रुझान (Price Trend): ${latestDecision.trend} (${latestDecision.trendPercentage || 0}%)
- निर्णय (Decision): ${latestDecision.sell_now_vs_wait === 'sell_now' ? 'अभी बेचें (Sell Now)' : 'इंतज़ार करें (Wait)'}
- मौसम का जोखिम स्तर (Weather Risk): ${latestDecision.weatherRiskLevel || 'low'} (${latestDecision.weatherRiskPercentage || 0}%)
      `.trim();
    }

    let mandisSummary = '';
    if (nearbyMandis.length > 0) {
      mandisSummary = 'उपलब्ध मंडियां (Available Mandis): ' +
        nearbyMandis.map(m => `${m.name} (${m.city})`).join(', ');
    }

    // 3. Construct System Prompt
    const systemPrompt = `
आप "फसल सहायक" (Fasal Sahayak / Crop Assistant) हैं — भारतीय किसानों के लिए एक बहुत ही विनम्र, समझदार और व्यावहारिक AI कृषि सलाहकार।

महत्वपूर्ण निर्देश:
1. भाषा (Language): ${lang === 'hi' ? 'उत्तर केवल शुद्ध एवं सरल हिंदी (देवनागरी लिपि) में दें। किसानों के अनुकूल बोलचाल की भाषा का प्रयोग करें।' : 'Respond in clear, simple, polite English.'}
2. संदर्भ पर आधारित (Grounded in Context): नीचे दिए गए वास्तविक किसान विश्लेषण और मंडी डेटा के आधार पर ही सटीक जानकारी दें:
${contextSummary}
${mandisSummary}
3. उत्तर का स्वरूप (Tone & Length):
- अत्यंत व्यावहारिक, सीधा और 2-4 वाक्यों में उत्तर दें ताकि किसान आसानी से समझ सके।
- जब किसान पूछे कि कहाँ बेचना चाहिए या क्या अभी बेचना चाहिए, तो वास्तविक आंकड़ों (मंडी का नाम, शुद्ध कमाई, परिवहन खर्च, मौसम जोखिम) का हवाला देकर समझाएं।
- कभी भी गलत या काल्पनिक मंडी भाव न बताएं।
- विनम्रता और अपनेपन का भाव रखें (जैसे: "नमस्ते किसान भाई", "मेरी सलाह है")।
`.trim();

    // 4. Check OpenRouter API Key
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    if (!apiKey) {
      // Fallback response if API key is not configured
      const fallbackText = lang === 'hi'
        ? `नमस्ते किसान भाई! आपके द्वारा पूछे गए सवाल के लिए: यदि आप ${latestDecision ? latestDecision.selectedMandiName : 'पिंपलगाँव मंडी'} में फसल बेचते हैं, तो कम परिवहन लागत के कारण सबसे अच्छी शुद्ध कमाई मिलने का अनुमान है। मौसम और भाव के रुझान को देखते हुए निर्णय लें।`
        : `Hello farmer! Based on your crop data, selling at ${latestDecision ? latestDecision.selectedMandiName : 'the recommended mandi'} gives you the highest net return after transport and weather risks.`;

      return res.json({
        success: true,
        message: {
          id: `c-${Date.now()}`,
          sender: 'assistant',
          text: fallbackText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      });
    }

    // 5. Prepare conversation messages for OpenRouter
    const formattedMessages = [
      { role: 'system', content: systemPrompt }
    ];

    // Include recent history (up to last 6 messages)
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-6);
      for (const msg of recentHistory) {
        if (msg.sender === 'user' && msg.text) {
          formattedMessages.push({ role: 'user', content: msg.text });
        } else if (msg.sender === 'assistant' && msg.text) {
          formattedMessages.push({ role: 'assistant', content: msg.text });
        }
      }
    }

    // Add current user message
    formattedMessages.push({ role: 'user', content: message.trim() });

    // 6. Call OpenRouter
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fasalnirnay.local',
        'X-Title': 'FasalNirnay Crop Assistant'
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        max_tokens: 600,
        temperature: 0.4
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!openRouterResponse.ok) {
      const errText = await openRouterResponse.text();
      console.error('[Chat] OpenRouter Error Response:', openRouterResponse.status, errText);
      throw new Error(`OpenRouter API responded with status ${openRouterResponse.status}`);
    }

    const data = await openRouterResponse.json();
    const assistantReply = data.choices?.[0]?.message?.content?.trim() ||
      (lang === 'hi' ? 'माफ़ करें, जानकारी प्राप्त करने में असमर्थ रहा। कृपया पुनः प्रयास करें।' : 'Sorry, could not generate a response. Please try again.');

    return res.json({
      success: true,
      message: {
        id: `c-${Date.now()}`,
        sender: 'assistant',
        text: assistantReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    });

  } catch (error) {
    console.error('[Chat] Controller error:', error.message);
    const lang = req.body?.lang || 'hi';
    const fallbackText = lang === 'hi'
      ? 'माफ़ करें, इस समय सर्वर से संपर्क नहीं हो पा रहा है। कृपया कुछ देर बाद पुनः पूछें।'
      : 'Sorry, unable to connect to the assistant right now. Please try again shortly.';

    return res.json({
      success: true,
      message: {
        id: `c-${Date.now()}`,
        sender: 'assistant',
        text: fallbackText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    });
  }
};

module.exports = {
  handleChat
};
