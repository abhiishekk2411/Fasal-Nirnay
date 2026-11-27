/**
 * Voice Parser Controller — FasalNirnay
 * Extracts structured crop and quantity (in quintals) from Hindi/Hinglish/English voice transcripts.
 * Combines OpenRouter (google/gemini-2.5-flash) with a deterministic regex/keyword fallback.
 */

// Supported standardized crops
const STANDARDIZED_CROPS = {
  Tomato: ['tomato', 'tomatoes', 'tamatar', 'tamater', 'टमाटर', 'तमाटर'],
  Onion: ['onion', 'onions', 'pyaaz', 'pyaz', 'pyaj', 'piaz', 'kanda', 'kaanda', 'कांदा', 'प्याज़', 'प्याज'],
  Potato: ['potato', 'potatoes', 'aloo', 'aaloo', 'alu', 'batata', 'बटाटा', 'आलू', 'आलु'],
  Wheat: ['wheat', 'gehu', 'gehun', 'gehoon', 'गेंहू', 'गेहूं', 'गेहूँ'],
  Paddy: ['paddy', 'dhan', 'dhaan', 'chawal', 'rice', 'धान', 'चावल'],
  Brinjal: ['brinjal', 'eggplant', 'baingan', 'baigan', 'बैंगन', 'बैगन'],
  Chilli: ['chilli', 'chili', 'mirch', 'mirchi', 'मिर्च', 'मिर्ची'],
  Cabbage: ['cabbage', 'patta gobhi', 'band gobhi', 'पत्ता गोभी', 'पत्तागोभी'],
  Cauliflower: ['cauliflower', 'phool gobhi', 'gobhi', 'फूल गोभी', 'गोभी'],
  Cotton: ['cotton', 'kapas', 'kapaas', 'कपास'],
  Soybean: ['soybean', 'soyabean', 'soya', 'सोयाबीन'],
  Maize: ['maize', 'corn', 'makka', 'makai', 'मक्का', 'मकई'],
  Sugarcane: ['sugarcane', 'ganna', 'गन्ना'],
  Grapes: ['grapes', 'grape', 'angoor', 'अंगूर'],
  Pomegranate: ['pomegranate', 'anaar', 'anar', 'अनार']
};

// Hindi / English number word dictionary
const HINDI_NUMBER_WORDS = {
  'aadha': 0.5, 'adha': 0.5, 'आधा': 0.5, 'half': 0.5,
  'dedh': 1.5, 'derh': 1.5, 'डेढ़': 1.5,
  'dhaai': 2.5, 'dhai': 2.5, 'ढाई': 2.5,
  'ek': 1, 'एक': 1, 'one': 1,
  'do': 2, 'दो': 2, 'two': 2,
  'teen': 3, 'तीन': 3, 'three': 3,
  'chaar': 4, 'char': 4, 'चार': 4, 'four': 4,
  'paanch': 5, 'panch': 5, 'पांच': 5, 'पाँच': 5, 'five': 5,
  'chhah': 6, 'che': 6, 'छह': 6, 'छः': 6, 'six': 6,
  'saat': 7, 'sat': 7, 'सात': 7, 'seven': 7,
  'aath': 8, 'ath': 8, 'आठ': 8, 'eight': 8,
  'nau': 9, 'no': 9, 'नौ': 9, 'nine': 9,
  'das': 10, 'दस': 10, 'ten': 10,
  'gyaarah': 11, 'gyarah': 11, 'ग्यारह': 11,
  'baarah': 12, 'barah': 12, 'बारह': 12,
  'terah': 13, 'तेरह': 13,
  'chaudah': 14, 'चौदह': 14,
  'pandrah': 15, 'पंद्रह': 15,
  'solah': 16, 'सोलह': 16,
  'satrah': 17, 'सत्रह': 17,
  'athaarah': 18, 'atharah': 18, 'अट्ठारह': 18,
  'unnees': 19, 'उन्नीस': 19,
  'bees': 20, 'बीस': 20, 'twenty': 20,
  'pachees': 25, 'पच्चीस': 25,
  'tees': 30, 'तीस': 30, 'thirty': 30,
  'paitees': 35, 'पैंतीस': 35,
  'chaalis': 40, 'chalis': 40, 'चालीस': 40, 'forty': 40,
  'pachaas': 50, 'pachas': 50, 'पचास': 50, 'fifty': 50,
  'saath': 60, 'sath': 60, 'साठ': 60, 'sixty': 60,
  'sattar': 70, 'सत्तर': 70, 'seventy': 70,
  'assi': 80, 'अस्सी': 80, 'eighty': 80,
  'nabbe': 90, 'नब्बे': 90, 'ninety': 90,
  'sau': 100, 'so': 100, 'सौ': 100, 'hundred': 100,
  'hazaar': 1000, 'hazar': 1000, 'हज़ार': 1000, 'thousand': 1000
};

const CLARIFICATION_PROMPT_DEFAULT = 'Ek quintal ke hisaab se bata raha hoon. Aapke paas kitna maal hai?';

/**
 * Deterministic keyword & regex fallback parser.
 * Handles regional names and units accurately.
 */
function parseDeterministic(transcript) {
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return {
      crop: null,
      quantityQuintals: 1,
      confidence: 0.0,
      needsClarification: true,
      clarificationPromptHindi: 'Kripya apni fasal aur maatra batayein.'
    };
  }

  const lower = transcript.toLowerCase().trim();

  // 1. Identify Crop
  let matchedCrop = null;
  for (const [cropName, synonyms] of Object.entries(STANDARDIZED_CROPS)) {
    for (const syn of synonyms) {
      const pattern = new RegExp(`(?:^|\\s|[^\\w\\u0900-\\u097F])${syn}(?:$|\\s|[^\\w\\u0900-\\u097F])`, 'i');
      if (pattern.test(lower)) {
        matchedCrop = cropName;
        break;
      }
    }
    if (matchedCrop) break;
  }

  // 2. Identify Quantity & Units
  let quantityQuintals = null;

  // Regex matching: (number/number-word)? (unit) (number/number-word)?
  const unitRegex = /(?:(\d+(?:\.\d+)?|[a-zA-Z\u0900-\u097F]+)\s*)?(quintal|quintel|kuntal|quntal|क्विंटल|कंटल|bori|boriyan|boryan|kattah|katta|katte|bora|bore|thaila|thaile|बोरी|बोरियां|कट्टा|कट्टे|बोरा|ton|tonne|tonnes|tons|टन|kg|kgs|kilo|kilos|kilogram|kilograms|किलो|किग्रा)(?:\s*(\d+(?:\.\d+)?|[a-zA-Z\u0900-\u097F]+))?/gi;

  let match;
  while ((match = unitRegex.exec(lower)) !== null) {
    const preNumStr = match[1];
    const unitStr = match[2].toLowerCase();
    const postNumStr = match[3];

    let rawNum = null;
    if (preNumStr) {
      if (!isNaN(Number(preNumStr))) {
        rawNum = Number(preNumStr);
      } else if (HINDI_NUMBER_WORDS[preNumStr.toLowerCase()]) {
        rawNum = HINDI_NUMBER_WORDS[preNumStr.toLowerCase()];
      }
    }
    if (rawNum == null && postNumStr) {
      if (!isNaN(Number(postNumStr))) {
        rawNum = Number(postNumStr);
      } else if (HINDI_NUMBER_WORDS[postNumStr.toLowerCase()]) {
        rawNum = HINDI_NUMBER_WORDS[postNumStr.toLowerCase()];
      }
    }

    // If unit found without immediate attached number, inspect preceding word
    if (rawNum == null) {
      const textBefore = lower.substring(0, match.index).trim();
      const tokensBefore = textBefore.split(/\s+/);
      const lastToken = tokensBefore[tokensBefore.length - 1];
      if (lastToken) {
        if (!isNaN(Number(lastToken))) {
          rawNum = Number(lastToken);
        } else if (HINDI_NUMBER_WORDS[lastToken.toLowerCase()]) {
          rawNum = HINDI_NUMBER_WORDS[lastToken.toLowerCase()];
        }
      }
    }

    // Default to 1 if unit explicitly stated without a quantity (e.g. "ek bori" vs "bori")
    if (rawNum == null) {
      rawNum = 1;
    }

    let multiplier = 1;
    if (/bori|boriyan|boryan|kattah|katta|katte|bora|bore|thaila|thaile|बोरी|बोरियां|कट्टा|कट्टे|बोरा/i.test(unitStr)) {
      multiplier = 0.5; // 1 bori = 0.5 quintals
    } else if (/ton|tonne|tonnes|tons|टन/i.test(unitStr)) {
      multiplier = 10; // 1 ton = 10 quintals
    } else if (/kg|kgs|kilo|kilos|kilogram|kilograms|किलो|किग्रा/i.test(unitStr)) {
      multiplier = 0.01; // 100 kg = 1 quintal
    } else if (/quintal|quintel|kuntal|quntal|क्विंटल|कंटल/i.test(unitStr)) {
      multiplier = 1; // 1 quintal = 1 quintal
    }

    quantityQuintals = Math.round(rawNum * multiplier * 100) / 100;
    break;
  }

  // Fallback: check if standalone number exists next to crop without unit
  if (quantityQuintals == null) {
    const standaloneNumRegex = /\b(\d+(?:\.\d+)?)\b/;
    const numMatch = lower.match(standaloneNumRegex);
    if (numMatch && !lower.includes('rate') && !lower.includes('bhav') && !lower.includes('kya')) {
      const val = Number(numMatch[1]);
      if (val > 0 && val < 500) {
        quantityQuintals = val; // Treat standalone reasonable number as quintals
      }
    }
  }

  let needsClarification = false;
  let clarificationPromptHindi = null;

  if (quantityQuintals == null) {
    quantityQuintals = 1;
    needsClarification = true;
    clarificationPromptHindi = CLARIFICATION_PROMPT_DEFAULT;
  }

  const confidence = matchedCrop ? (needsClarification ? 0.85 : 0.95) : 0.0;

  return {
    crop: matchedCrop,
    quantityQuintals,
    confidence,
    needsClarification,
    clarificationPromptHindi
  };
}

/**
 * OpenRouter AI Parser
 * Uses Gemini via OpenRouter to parse complex spoken farmer queries.
 */
async function parseWithOpenRouter(transcript, language = 'hi') {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const systemPrompt = `You are a specialized agricultural voice parser for Indian farmers in the FasalNirnay application.
Your goal is to parse spoken farmer transcripts (in Hindi, Hinglish, or English) into structured data.

Supported Standardized Crops:
- "tamatar", "tamater", "tomato" -> "Tomato"
- "pyaaz", "pyaz", "kanda", "onion" -> "Onion"
- "aloo", "aaloo", "alu", "potato", "batata" -> "Potato"
- "gehu", "gehun", "wheat" -> "Wheat"
- "dhan", "dhaan", "chawal", "paddy", "rice" -> "Paddy"
- "baingan", "brinjal", "eggplant" -> "Brinjal"
- "mirch", "chilli" -> "Chilli"
- "cabbage", "patta gobhi" -> "Cabbage"
- "cauliflower", "phool gobhi" -> "Cauliflower"
- "cotton", "kapas" -> "Cotton"
- "soybean", "soya" -> "Soybean"
- "maize", "makka", "corn" -> "Maize"

Standardized Unit Normalization (Convert everything to quintals):
- 1 quintal = 1.0 quintal
- 1 bori / katta / bora / bag = 0.5 quintals (e.g. 40 bori = 20 quintals, 1 bori = 0.5 quintals)
- 1 ton / 1000 kg = 10.0 quintals
- 100 kg = 1.0 quintal (e.g. 500 kg = 5 quintals)

Missing Quantity Handling:
- If quantity is missing from the transcript (e.g. "tamatar ka rate kya hai", "aloo ka bhav batao"):
  - default "quantityQuintals" to 1
  - set "needsClarification" to true
  - set "clarificationPromptHindi" to "Ek quintal ke hisaab se bata raha hoon. Aapke paas kitna maal hai?"

Response Format:
Return ONLY a valid JSON object matching this schema with no markdown or backticks:
{
  "crop": "Tomato" | "Onion" | "Potato" | "Wheat" | "Paddy" | string | null,
  "quantityQuintals": number,
  "confidence": number,
  "needsClarification": boolean,
  "clarificationPromptHindi": string | null
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s timeout for fast response

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fasalnirnay.local',
        'X-Title': 'FasalNirnay Voice Parser'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Farmer voice transcript: "${transcript}" (Spoken language: ${language})` }
        ],
        temperature: 0.1,
        max_tokens: 200
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter returned status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('Empty response from OpenRouter');
    }

    // Clean JSON markdown if wrapped
    const cleanJson = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleanJson);

    // Validate and sanitize parsed fields
    let normalizedCrop = parsed.crop || null;
    if (normalizedCrop) {
      // Ensure TitleCase matching our supported crop keys
      for (const [key, synonyms] of Object.entries(STANDARDIZED_CROPS)) {
        if (key.toLowerCase() === normalizedCrop.toLowerCase() || synonyms.includes(normalizedCrop.toLowerCase())) {
          normalizedCrop = key;
          break;
        }
      }
    }

    const quantityQuintals = typeof parsed.quantityQuintals === 'number' && parsed.quantityQuintals > 0
      ? parsed.quantityQuintals
      : 1;

    const needsClarification = Boolean(parsed.needsClarification);
    const clarificationPromptHindi = needsClarification
      ? (parsed.clarificationPromptHindi || CLARIFICATION_PROMPT_DEFAULT)
      : null;

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.9;

    return {
      crop: normalizedCrop,
      quantityQuintals,
      confidence,
      needsClarification,
      clarificationPromptHindi
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Controller: POST /api/voice/parse
 */
const parseVoice = async (req, res, next) => {
  try {
    const { transcript, language = 'hi' } = req.body;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required'
      });
    }

    let result = null;

    // Try OpenRouter with deterministic fallback
    try {
      result = await parseWithOpenRouter(transcript, language);
    } catch (aiErr) {
      console.warn('[VoiceParser] OpenRouter fallback engaged:', aiErr.message);
      result = parseDeterministic(transcript);
    }

    // Fallback if AI produced null crop but deterministic parser can identify it
    if (!result.crop) {
      const fallbackResult = parseDeterministic(transcript);
      if (fallbackResult.crop) {
        result = fallbackResult;
      }
    }

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  parseVoice,
  parseDeterministic,
  parseWithOpenRouter
};
