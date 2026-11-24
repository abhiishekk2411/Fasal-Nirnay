// ============================================================================
// i18n — FasalNirnay Language Context
// ============================================================================
// Provides language state (persisted in localStorage) and a t() lookup function.
// Default language: Hindi ('hi') — target user is a farmer.
// Architecture ready for adding Marathi ('mr') and other languages later.
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import en from './en';
import hi from './hi';

// Add new languages here — e.g. import mr from './mr';
const translations = { en, hi };

// Supported languages metadata (for UI rendering)
export const languages = [
  { code: 'hi', label: 'हिंदी', labelEn: 'Hindi' },
  { code: 'en', label: 'English', labelEn: 'English' },
  // { code: 'mr', label: 'मराठी', labelEn: 'Marathi' },  // Add later
];

const STORAGE_KEY = 'fasalnirnay-lang';
const DEFAULT_LANG = 'hi';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    } catch {
      return DEFAULT_LANG;
    }
  });

  // Persist language choice
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable — silent fail
    }
  }, [lang]);

  const setLang = useCallback((newLang) => {
    if (translations[newLang]) {
      setLangState(newLang);
    }
  }, []);

  // Translation lookup: t('landing.heroTitle1', fallback) → dot-notation key resolution
  const t = useCallback(
    (key, fallback) => {
      const keys = key.split('.');
      let value = translations[lang];
      for (const k of keys) {
        if (value == null) return fallback !== undefined ? fallback : key;
        value = value[k];
      }
      return value ?? (fallback !== undefined ? fallback : key);
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Cleanly formats a mandi name to prevent raw keys like "mandis.kollam-market-kollam"
 */
export function formatMandiName(mandiId, fallbackName, t) {
  if (mandiId && t) {
    const translated = t(`mandis.${mandiId}`, null);
    if (translated) return translated;
  }
  if (fallbackName && !fallbackName.startsWith('mandis.')) {
    return fallbackName;
  }
  if (mandiId && typeof mandiId === 'string') {
    const cleanId = mandiId.replace(/^mandis\./, '');
    const cleaned = cleanId
      .split('-')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return cleaned ? `${cleaned} Mandi` : 'मंडी';
  }
  return fallbackName || 'मंडी';
}

/**
 * Cleanly formats a crop name to prevent raw keys like "crops.eggplant"
 */
export function formatCropName(cropId, fallbackName, t) {
  if (cropId && t) {
    const translated = t(`crops.${cropId.toLowerCase()}`, null);
    if (translated) return translated;
  }
  if (fallbackName && !fallbackName.startsWith('crops.')) {
    return fallbackName;
  }
  return cropId ? (cropId.charAt(0).toUpperCase() + cropId.slice(1)) : (fallbackName || '');
}

/**
 * Cleanly formats a variety name to prevent raw keys like "varieties.long_purple"
 */
export function formatVarietyName(varietyId, fallbackName, t) {
  if (varietyId && t) {
    const translated = t(`varieties.${varietyId.toLowerCase()}`, null);
    if (translated) return translated;
  }
  if (fallbackName && !fallbackName.startsWith('varieties.')) {
    return fallbackName;
  }
  if (varietyId && typeof varietyId === 'string') {
    return varietyId
      .replace(/^varieties\./, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return fallbackName || '';
}

/**
 * Hook to access translation function and language state.
 * @returns {{ t: (key: string) => string, lang: string, setLang: (code: string) => void }}
 */
export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a <LanguageProvider>');
  }
  return context;
}
