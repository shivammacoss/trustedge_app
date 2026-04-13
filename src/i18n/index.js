import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

import en from './locales/en';
import hi from './locales/hi';
import es from './locales/es';

const LOCALES = { en, hi, es };

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी',   flag: '🇮🇳' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
];

const I18nContext = createContext();

/**
 * Get a nested value from an object by dot-path, e.g. "pamm.title"
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync('app_locale');
        if (saved && LOCALES[saved]) setLocaleState(saved);
      } catch (_) {}
      setReady(true);
    })();
  }, []);

  const setLocale = useCallback(async (code) => {
    if (!LOCALES[code]) return;
    setLocaleState(code);
    try { await SecureStore.setItemAsync('app_locale', code); } catch (_) {}
  }, []);

  /**
   * Translate helper.  t('pamm.title')  or  t('academy.questionOf', { current: 1, total: 5 })
   */
  const t = useCallback((key, params) => {
    let text = getNestedValue(LOCALES[locale], key)
            ?? getNestedValue(LOCALES.en, key)
            ?? key;
    if (params && typeof text === 'string') {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return text;
  }, [locale]);

  if (!ready) return null;

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, languages: LANGUAGES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback when used outside provider
    return {
      locale: 'en',
      setLocale: () => {},
      t: (key) => getNestedValue(en, key) ?? key,
      languages: LANGUAGES,
    };
  }
  return ctx;
}
