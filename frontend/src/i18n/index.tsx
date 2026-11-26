'use client';

import { useUserStore } from '@/stores/userStore';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Static import for default locale – always available, no network round-trip needed.
import en from '@/i18n/locales/en.json';

export type Locale = 'en' | 'es' | 'zh' | 'ar' | 'he' | 'fa';
type Dictionary = Record<string, unknown>;

/** Locales that use right-to-left text direction. */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar', 'he', 'fa']);

/** Returns the CSS writing direction for the given locale. */
export function getDir(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

const LOCALE_KEY = 'app:locale';

// Runtime dictionary cache – populated lazily per locale.
const dictionaryCache: Partial<Record<Locale, Dictionary>> = { en };

/**
 * Dynamically import a locale JSON chunk.
 * Next.js / webpack will split each locale into a separate asset so users only
 * download the bundle for their chosen language.
 */
async function loadDictionary(locale: Locale): Promise<Dictionary> {
  if (dictionaryCache[locale]) return dictionaryCache[locale]!;

  let mod: { default: Dictionary };
  switch (locale) {
    case 'es':
      mod = await import('@/i18n/locales/es.json');
      break;
    case 'zh':
      mod = await import('@/i18n/locales/zh.json');
      break;
    case 'ar':
      mod = await import('@/i18n/locales/ar.json');
      break;
    case 'he':
      mod = await import('@/i18n/locales/he.json');
      break;
    case 'fa':
      mod = await import('@/i18n/locales/fa.json');
      break;
    default:
      mod = { default: en };
  }

  const dict = mod.default as Dictionary;
  dictionaryCache[locale] = dict;
  return dict;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return Object.entries(params).reduce((str, [key, val]) => {
    return str.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
  }, template);
}

const localeTagMap: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
  zh: 'zh-CN',
  ar: 'ar-SA',
  he: 'he-IL',
  fa: 'fa-IR',
};

const currencyMap: Record<Locale, string> = {
  en: 'USD',
  es: 'EUR',
  zh: 'CNY',
  ar: 'SAR',
  he: 'ILS',
  fa: 'IRR',
};

/** Detect locale from browser language hint. */
function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith('ar')) return 'ar';
  if (browser.startsWith('he')) return 'he';
  if (browser.startsWith('fa')) return 'fa';
  if (browser.startsWith('es')) return 'es';
  if (browser.startsWith('zh')) return 'zh';
  return 'en';
}

const ALL_LOCALES: ReadonlySet<string> = new Set(['en', 'es', 'zh', 'ar', 'he', 'fa']);

function isValidLocale(value: unknown): value is Locale {
  return typeof value === 'string' && ALL_LOCALES.has(value);
}

interface I18nContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  tn: <T = unknown>(key: string) => T | undefined;
  formatCurrency: (amount: number, currency?: string) => string;
  formatDate: (date: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  pluralize: (count: number, singularKey: string, pluralKey: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [dict, setDict] = useState<Dictionary>(en);
  const updatePreferences = useUserStore((state) => state.updatePreferences);

  // Resolve initial locale from cookie → localStorage → browser hint.
  useEffect(() => {
    const cookieLocale = getCookie(LOCALE_KEY);
    if (isValidLocale(cookieLocale)) {
      setLocaleState(cookieLocale);
      return;
    }
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (isValidLocale(stored)) {
      setLocaleState(stored);
      setCookie(LOCALE_KEY, stored);
      return;
    }
    const detected = detectBrowserLocale();
    setLocaleState(detected);
    setCookie(LOCALE_KEY, detected);
  }, []);

  // Whenever locale changes: load its dictionary chunk, then update the DOM.
  useEffect(() => {
    loadDictionary(locale).then((loaded) => {
      setDict(loaded);
      // Inject lang + dir attributes so the browser applies correct BiDi rendering.
      document.documentElement.lang = localeTagMap[locale] ?? locale;
      document.documentElement.dir = getDir(locale);
      window.localStorage.setItem(LOCALE_KEY, locale);
      setCookie(LOCALE_KEY, locale);
    });
  }, [locale]);

  const handleSetLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleState(newLocale);
      window.localStorage.setItem(LOCALE_KEY, newLocale);
      setCookie(LOCALE_KEY, newLocale);
      updatePreferences({ language: newLocale });
    },
    [updatePreferences]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: getDir(locale),
      setLocale: handleSetLocale,
      t: (key: string, params?: Record<string, string | number>) => {
        const val = getNestedValue(dict, key);
        if (typeof val === 'string') return interpolate(val, params);
        const fallback = getNestedValue(en, key);
        if (typeof fallback === 'string') return interpolate(fallback, params);
        return key;
      },
      tn: <T,>(key: string) => {
        const val = getNestedValue(dict, key);
        if (val !== undefined) return val as T;
        const fallback = getNestedValue(en, key);
        if (fallback !== undefined) return fallback as T;
        return undefined;
      },
      formatCurrency: (amount: number, currency?: string) => {
        const curr = currency || currencyMap[locale] || 'USD';
        const tag = localeTagMap[locale] || 'en-US';
        return new Intl.NumberFormat(tag, { style: 'currency', currency: curr }).format(amount);
      },
      formatDate: (date: Date | number | string, options?: Intl.DateTimeFormatOptions) => {
        const d = new Date(date);
        const tag = localeTagMap[locale] || 'en-US';
        const opts: Intl.DateTimeFormatOptions = options || { dateStyle: 'medium' };
        return new Intl.DateTimeFormat(tag, opts).format(d);
      },
      formatNumber: (val: number, options?: Intl.NumberFormatOptions) => {
        const tag = localeTagMap[locale] || 'en-US';
        return new Intl.NumberFormat(tag, options).format(val);
      },
      pluralize: (count: number, singularKey: string, pluralKey: string, params?: Record<string, string | number>) => {
        const key = count === 1 ? singularKey : pluralKey;
        const val = getNestedValue(dict, key) ?? getNestedValue(en, key);
        const template = typeof val === 'string' ? val : key;
        const pluralSuffix = count === 1 ? '' : 's';
        return interpolate(template, { count, plural: pluralSuffix, ...params });
      },
    }),
    [locale, dict, handleSetLocale]
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
