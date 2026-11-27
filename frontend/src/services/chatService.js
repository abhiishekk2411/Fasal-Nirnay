/**
 * Chat Service — FasalNirnay Frontend
 * Connects directly to backend POST /api/chat backed by OpenRouter (google/gemini-2.5-flash)
 */

import { apiRequest } from './api';
import { getCurrentUserId } from './decisionService';

/**
 * Send message to Crop Assistant and receive AI response.
 * @param {string} message - User message
 * @param {Array} history - Previous conversation
 * @param {string} lang - 'hi' | 'en'
 * @returns {Promise<Object>} Assistant response message
 */
export async function sendChatMessage(message, history = [], lang = 'hi') {
  let messageText = '';
  if (typeof message === 'string') {
    messageText = message;
  } else if (message && typeof message.text === 'string') {
    messageText = message.text;
  }

  if (!messageText.trim()) {
    return {
      id: `c-${Date.now()}`,
      sender: 'assistant',
      text: lang === 'hi' 
        ? 'कृपया अपना सवाल लिखकर या बोलकर पूछें।' 
        : 'Please enter or speak your question.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  const userId = getCurrentUserId();

  try {
    const result = await apiRequest('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: messageText.trim(),
        history,
        lang,
        userId
      })
    });

    if (result && result.message) {
      return result.message;
    }

    throw new Error('Invalid response structure from chat API');
  } catch (error) {
    console.error("Chat Service Error:", error);
    return {
      id: `c-${Date.now()}`,
      sender: 'assistant',
      text: lang === 'hi'
        ? 'माफ़ करें, सहायक से संपर्क करने में समस्या आई। कृपया थोड़ी देर बाद पुनः प्रयास करें।'
        : 'Sorry, could not connect to Crop Assistant. Please try again in a moment.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }
}

export const chatSuggestions = [
  'bestMandi',
  'sellNow',
  'nearbyPrices',
  'weatherRisk',
  'compareAll',
];

export function getSuggestions() {
  return chatSuggestions;
}
