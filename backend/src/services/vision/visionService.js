/**
 * Analyzes a crop image using OpenRouter Vision Model.
 * @param {Buffer} imageBuffer - The image file buffer.
 * @param {string} mimeType - The mime type of the image.
 * @returns {Object} Extracted crop info
 */

const normalizeCropData = (rawCropId, rawCropName, rawVarietyId, rawVarietyName) => {
  const cropStr = `${rawCropId || ''} ${rawCropName || ''}`.toLowerCase();
  const varietyStr = `${rawVarietyId || ''} ${rawVarietyName || ''}`.toLowerCase();

  let cropId = rawCropId ? rawCropId.toLowerCase().trim() : null;
  let cropName = rawCropName || null;
  let varietyId = rawVarietyId ? rawVarietyId.toLowerCase().trim() : null;
  let varietyName = rawVarietyName || null;

  // 1. Brinjal / Eggplant / Baingan
  if (cropStr.includes('brinjal') || cropStr.includes('eggplant') || cropStr.includes('aubergine') || cropStr.includes('baingan') || cropStr.includes('बैंगन')) {
    cropId = 'brinjal';
    cropName = 'Brinjal (बैंगन)';
    if (varietyStr.includes('purple') || varietyStr.includes('long') || varietyStr.includes('लंबा')) {
      varietyId = 'long_purple';
      varietyName = 'Long Purple (लंबा बैंगनी)';
    } else if (varietyStr.includes('round') || varietyStr.includes('गोल')) {
      varietyId = 'round';
      varietyName = 'Round (गोल)';
    } else if (!varietyId) {
      varietyId = 'desi';
      varietyName = 'Desi (देसी)';
    }
  } else if (cropStr.includes('tomat') || cropStr.includes('टमाटर')) {
    cropId = 'tomato';
    cropName = 'Tomato (टमाटर)';
  } else if (cropStr.includes('onion') || cropStr.includes('प्याज़') || cropStr.includes('प्याज')) {
    cropId = 'onion';
    cropName = 'Onion (प्याज)';
  } else if (cropStr.includes('potat') || cropStr.includes('आलू')) {
    cropId = 'potato';
    cropName = 'Potato (आलू)';
  } else if (cropStr.includes('wheat') || cropStr.includes('गेहूँ') || cropStr.includes('गेहूं')) {
    cropId = 'wheat';
    cropName = 'Wheat (गेहूं)';
  } else if (cropStr.includes('rice') || cropStr.includes('paddy') || cropStr.includes('धान')) {
    cropId = 'rice';
    cropName = 'Rice (धान)';
  } else if (cropStr.includes('chill') || cropStr.includes('मिर्च')) {
    cropId = 'chilli';
    cropName = 'Chilli (मिर्च)';
  } else if (cropStr.includes('cabbage') || cropStr.includes('पत्तागोभी')) {
    cropId = 'cabbage';
    cropName = 'Cabbage (पत्तागोभी)';
  } else if (cropStr.includes('cauliflower') || cropStr.includes('फूलगोभी')) {
    cropId = 'cauliflower';
    cropName = 'Cauliflower (फूलगोभी)';
  } else if (cropStr.includes('soybean') || cropStr.includes('सोयाबीन')) {
    cropId = 'soybean';
    cropName = 'Soybean (सोयाबीन)';
  } else if (cropStr.includes('cotton') || cropStr.includes('कपास')) {
    cropId = 'cotton';
    cropName = 'Cotton (कपास)';
  } else if (cropStr.includes('maize') || cropStr.includes('corn') || cropStr.includes('मक्का')) {
    cropId = 'maize';
    cropName = 'Maize (मक्का)';
  }

  return { cropId, cropName, varietyId, varietyName };
};

const analyzeCropImage = async (imageBuffer, mimeType) => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API Key is missing. Cannot perform image analysis.');
  }

  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  const prompt = `
You are an expert crop identification assistant for Indian agriculture.
Analyze only the visible crop, vegetable, produce, or plant in the image.
Identify the crop name and variety.

You MUST choose "cropId" from this supported list:
- "brinjal" (for Brinjal, Eggplant, Aubergine, Baingan / बैंगन. CRITICAL: ALWAYS use "brinjal", NEVER output "eggplant")
- "tomato" (Tomato / टमाटर)
- "onion" (Onion / प्याज)
- "potato" (Potato / आलू)
- "wheat" (Wheat / गेहूं)
- "rice" (Rice / धान)
- "chilli" (Chilli / मिर्च)
- "cabbage" (Cabbage / पत्तागोभी)
- "cauliflower" (Cauliflower / फूलगोभी)
- "soybean" (Soybean / सोयाबीन)
- "cotton" (Cotton / कपास)
- "maize" (Maize / मक्का)
- "sugarcane" (Sugarcane / गन्ना)
- "grapes" (Grapes / अंगूर)
- "pomegranate" (Pomegranate / अनार)

Return JSON only in this exact structure:
{
  "cropId": "brinjal",
  "cropName": "Brinjal (बैंगन)",
  "varietyId": "long_purple",
  "varietyName": "Long Purple",
  "confidence": 0.95
}

If variety cannot be identified with visual evidence, set varietyId and varietyName to null.
Return valid JSON without any markdown code fences.
`;

  try {
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl
                }
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`OpenRouter API Error: ${response.status} ${response.statusText}`);
      throw new Error(`OpenRouter API Error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('Invalid response structure from OpenRouter');
    }

    let resultText = data.choices[0].message.content.trim();
    if (resultText.startsWith('```json')) {
      resultText = resultText.substring(7);
      if (resultText.endsWith('```')) {
        resultText = resultText.substring(0, resultText.length - 3);
      }
    } else if (resultText.startsWith('```')) {
      resultText = resultText.substring(3);
      if (resultText.endsWith('```')) {
        resultText = resultText.substring(0, resultText.length - 3);
      }
    }

    const jsonResult = JSON.parse(resultText);

    // Normalize crop and variety
    const normalized = normalizeCropData(
      jsonResult.cropId,
      jsonResult.cropName,
      jsonResult.varietyId,
      jsonResult.varietyName
    );

    return {
      cropId: normalized.cropId || null,
      cropName: normalized.cropName || null,
      varietyId: normalized.varietyId || null,
      varietyName: normalized.varietyName || null,
      confidence: jsonResult.confidence || 0.9
    };

  } catch (error) {
    console.error('Vision API Error:', error);
    throw new Error('Failed to analyze image with OpenRouter Vision');
  }
};

module.exports = {
  analyzeCropImage,
  normalizeCropData
};
