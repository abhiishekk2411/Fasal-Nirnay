/**
 * API Base Configuration — FasalNirnay Frontend
 * Provides the base API client for communicating with the backend.
 */

const API_ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const BASE_URL = API_ROOT ? `${API_ROOT}/api` : '/api';

/**
 * Generic API request helper.
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    if (!response.ok) {
      // Try to parse the error message from the backend JSON response if available
      let errorMsg = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMsg = errorData.message;
        }
      } catch (e) {
        // Fallback to standard status text if no JSON error message
      }
      throw new Error(errorMsg);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API Request failed for ${url}:`, error);
    throw error;
  }
}

export default { apiRequest };
