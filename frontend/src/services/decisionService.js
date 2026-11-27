/**
 * Decision Service — FasalNirnay Frontend
 * Communicates with the backend decision endpoints.
 */

import { apiRequest, BASE_URL } from './api';

export const getCurrentUserId = () => {
  try {
    const userStr = localStorage.getItem('fasalnirnay_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.userId || user.phone) return user.userId || user.phone;
    }
  } catch (e) {
    // Ignore JSON error
  }
  return 'demo_farmer_001';
};

export const parseVoiceTranscript = async (transcript, language = 'hi') => {
  const result = await apiRequest('/voice/parse', {
    method: 'POST',
    body: JSON.stringify({ transcript, language })
  });
  return result;
};

export const analyzeDecision = async (formData) => {
  const userId = getCurrentUserId();
  
  let quantityKg = formData.quantityKg;
  if (quantityKg == null) {
    const rawQty = Number(formData.quantity) || 0;
    if (formData.unit === 'quintal' || formData.unit === 'क्विंटल' || formData.quantityQuintals != null) {
      quantityKg = (formData.quantityQuintals != null ? Number(formData.quantityQuintals) : rawQty) * 100;
    } else {
      quantityKg = rawQty;
    }
  }

  const payload = {
    userId,
    cropId: formData.crop?.toLowerCase() || formData.cropId,
    varietyId: formData.variety?.toLowerCase() || formData.varietyId || 'hybrid',
    quantityKg,
    location: formData.location || formData.farmerLocation
  };
  if (formData.latitude != null && formData.longitude != null) {
    payload.coordinates = {
      latitude: formData.latitude,
      longitude: formData.longitude
    };
  }
  const result = await apiRequest('/decision/analyze', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return result.data;
};

export const getMarketTrend = async (cropId, mandiId, varietyId, days = 30) => {
  const queryParams = new URLSearchParams({
    crop: cropId.toLowerCase(),
    mandi: mandiId.toLowerCase(),
    variety: varietyId.toLowerCase(),
    days: days.toString()
  });

  const response = await apiRequest(`/markets/trend?${queryParams.toString()}`, {
    method: 'GET'
  });

  return response.data;
};

export const getDashboard = async () => {
  const result = await apiRequest('/dashboard');
  return result.data;
};

export const getHistory = async (limit = 20) => {
  const result = await apiRequest(`/history?limit=${limit}`);
  return result.data;
};

export const analyzeImage = async (file) => {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch(`${BASE_URL}/vision/analyze`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to analyze image');
    }
    return result;
  } catch (error) {
    throw error;
  }
};
