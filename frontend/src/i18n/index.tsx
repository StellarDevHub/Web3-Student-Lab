'use client';

import { useUserStore } from '@/stores/userStore';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import zh from '@/i18n/locales/zh.json';

export type Locale = 'en' | 'es' | 'zh';
type Dictionary = Record<string, unknown>;

const dictionaries: Record<Locale, Dictionary> = { en, es, zh };
const LOCALE_KEY = 'app:locale';

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  tn: <T = unknown>(key: string) => T | undefined;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const updatePreferences = useUserStore((state) => state.updatePreferences);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (stored && dictionaries[stored]) {
      setLocaleState(stored);
      return;
    }
    const browser = navigator.language.toLowerCase();
    if (browser.startsWith('es')) setLocaleState('es');
    else if (browser.startsWith('zh')) setLocaleState('zh');
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  const handleSetLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleState(newLocale);
      updatePreferences({ language: newLocale });
    },
    [updatePreferences]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: handleSetLocale,
      t: (key: string) => {
        const value = getNestedValue(dictionaries[locale], key);
        if (typeof value === 'string') return value;
        const fallback = getNestedValue(dictionaries.en, key);
        if (typeof fallback === 'string') return fallback;
        return key;
      },
      tn: <T,>(key: string) => {
        const value = getNestedValue(dictionaries[locale], key);
        if (value !== undefined) return value as T;
        const fallback = getNestedValue(dictionaries.en, key);
        if (fallback !== undefined) return fallback as T;
        return undefined;
      },
    }),
    [locale, handleSetLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}
