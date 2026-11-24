/**
 * Decision Service — FasalNirnay Frontend
 * Communicates with the backend decision endpoints.
 */

import { apiRequest } from './api';

export const analyzeDecision = async (formData) => {
  const payload = {
    cropId: formData.crop?.toLowerCase() || formData.cropId,
    varietyId: formData.variety?.toLowerCase() || formData.varietyId,
    quantityKg: Number(formData.quantity) || formData.quantityKg,
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
    const response = await fetch('/api/vision/analyze', {
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
