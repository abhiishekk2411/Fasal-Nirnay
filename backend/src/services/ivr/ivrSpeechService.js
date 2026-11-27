/**
 * Dynamic Hindi Speech Generation Service for IVR
 * Converts backend recommendation results into natural, respectful Hindi voice scripts for Exotel TTS.
 *
 * IMPORTANT INTEGRATION PREREQUISITE (EXOTEL TTS):
 * Do not assume Hindi TTS (Devanagari text-to-speech) is supported out-of-the-box on your Exotel tenant.
 * Exotel dynamic playback URLs feed text directly into Exotel's TTS voice engine. Default Exotel setups
 * use English TTS engines. Rendering Devanagari text requires an Indian TTS engine (e.g. AWS Polly Aditi/Kajal)
 * to be provisioned and assigned on the Exotel account.
 * Before deploying to live callers:
 * 1. Test playback on a live Exotel test call to verify Hindi TTS pronunciation.
 * 2. If Hindi TTS is unavailable, configure Exotel to use static audio file URLs (.mp3/.wav)
 *    or Romanized Hindi prompts.
 */

/**
 * Generates natural spoken Hindi advice from the decision result.
 * @param {Object} params
 * @param {string} params.cropNameHi - e.g. 'टमाटर'
 * @param {number} params.quantityKg - e.g. 800
 * @param {string} params.locationNameHi - e.g. 'नासिक'
 * @param {Object} params.bestMandi - details of the recommended mandi
 * @param {Object} params.weatherRisk - weather risk summary
 * @returns {string} Hindi speech text
 */
const buildRecommendationSpeechHindi = ({
  cropNameHi,
  quantityKg,
  locationNameHi,
  bestMandi,
  weatherRisk
}) => {
  const mandiName = bestMandi.mandiName || bestMandi.name || 'पास की मुख्य मंडी';
  const distanceKm = Math.round(bestMandi.distanceKm || 0);
  const netEarnings = Math.round(bestMandi.expectedNetReturn || 0).toLocaleString('en-IN');
  const pricePerKg = Math.round(bestMandi.price || 0);
  const isSellNow = bestMandi.sell_now_vs_wait === 'sell_now';

  // Format timing advice based on weather and price trend
  let timingAdviceHi = '';
  if (weatherRisk && weatherRisk.riskLevel === 'high') {
    timingAdviceHi = 'हमारी सलाह है कि आप फसल तुरंत बेचें, क्योंकि अगले चौबीस घंटों में मौसम और बारिश का जोखिम अधिक है, जिससे नुकसान हो सकता है।';
  } else if (!weatherRisk || weatherRisk.riskLevel === 'unknown' || weatherRisk.available === false) {
    // Explicitly notify caller that live weather forecast is currently unavailable
    if (bestMandi.trend === 'decreasing') {
      timingAdviceHi = 'मौसम का लाइव पूर्वानुमान अभी उपलब्ध नहीं है। मंडी में दाम गिरने का रुझान है, इसलिए बिना देरी किए आज ही बेचना आपके लिए अधिक लाभकारी रहेगा।';
    } else if (bestMandi.trend === 'increasing' && !isSellNow) {
      timingAdviceHi = 'मौसम का लाइव पूर्वानुमान अभी उपलब्ध नहीं है। बाज़ार में दाम बढ़ने के संकेत हैं, इसलिए आप दो से तीन दिन रुक कर बेच सकते हैं।';
    } else {
      timingAdviceHi = 'मौसम का लाइव पूर्वानुमान अभी उपलब्ध नहीं है। मंडी में भाव स्थिर है, आप अपनी सुविधानुसार आज या कल में बिक्री कर सकते हैं।';
    }
  } else if (bestMandi.trend === 'increasing' && !isSellNow) {
    timingAdviceHi = 'बाज़ार में दाम बढ़ने के संकेत हैं। यदि आपके पास सुरक्षित भंडारण है, तो आप दो से तीन दिन रुक कर बेच सकते हैं।';
  } else if (bestMandi.trend === 'decreasing') {
    timingAdviceHi = 'मंडी में दाम गिरने का रुझान है, इसलिए बिना देरी किए आज ही बेचना आपके लिए अधिक लाभकारी रहेगा।';
  } else {
    timingAdviceHi = 'मंडी में भाव स्थिर है। आप अपनी सुविधानुसार आज या कल में बिक्री कर सकते हैं।';
  }

  // Natural flow: Greeting -> Best Mandi -> Net return -> Timing advice -> Repeat menu
  const speech = `नमस्ते! फसल-निर्णय में आपका स्वागत है। आपके ${cropNameHi}, ${quantityKg} किलो और ${locationNameHi} क्षेत्र के लिए विश्लेषण पूरा हो गया है। ` +
    `आपके लिए सबसे बेहतर विकल्प ${mandiName} है, जो लगभग ${distanceKm} किलोमीटर दूरी पर है। ` +
    `यहाँ अनुमानित भाव ${pricePerKg} रुपये प्रति किलो है, और परिवहन खर्च घटाकर आपकी शुद्ध कमाई लगभग ${netEarnings} रुपये होगी। ` +
    `${timingAdviceHi} ` +
    `इस जानकारी को दोबारा सुनने के लिए 1 दबाएं, या कॉल समाप्त करने के लिए फोन काट दें। धन्यवाद।`;

  return speech.trim();
};

/**
 * Dynamic error response spoken in Hindi
 * Accurately describes all 4 supported options for Crop, Quantity, and Location.
 */
const buildErrorSpeechHindi = (reason = 'default') => {
  switch (reason) {
    case 'INVALID_CROP':
      return 'अमान्य फसल का चयन किया गया है। कृपया टमाटर के लिए 1, प्याज़ के लिए 2, आलू के लिए 3, अथवा गेहूँ के लिए 4 दबाएं।';
    case 'INVALID_QUANTITY':
      return 'अमान्य मात्रा का चयन किया गया है। कृपया 400 किलो के लिए 1, 800 किलो के लिए 2, 1200 किलो के लिए 3, अथवा 2000 किलो के लिए 4 दबाएं।';
    case 'INVALID_LOCATION':
      return 'अमान्य स्थान का चयन किया गया है। कृपया नासिक के लिए 1, पुणे के लिए 2, सोलापुर के लिए 3, अथवा नागपुर के लिए 4 दबाएं।';
    case 'SESSION_UNAVAILABLE':
      return 'इस कॉल के लिए सलाह उपलब्ध नहीं है। कृपया दोबारा कॉल करके अपनी फसल, मात्रा और स्थान चुनें।';
    case 'NO_MARKET_DATA':
      return 'क्षमा करें, इस फसल के लिए वर्तमान में आसपास की मंडियों का भाव उपलब्ध नहीं है। कृपया थोड़ी देर बाद प्रयास करें।';
    default:
      return 'तकनीकी समस्या के कारण जानकारी प्राप्त नहीं हो सकी। कृपया कुछ समय बाद पुनः प्रयास करें। धन्यवाद।';
  }
};

/**
 * Goodbye message
 */
const buildGoodbyeSpeechHindi = () => {
  return 'फसल-निर्णय हेल्पलाइन पर कॉल करने के लिए धन्यवाद। आपका दिन शुभ हो!';
};

module.exports = {
  buildRecommendationSpeechHindi,
  buildErrorSpeechHindi,
  buildGoodbyeSpeechHindi
};
