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
};

const currencyMap: Record<Locale, string> = {
  en: 'USD',
  es: 'EUR',
  zh: 'CNY',
};

interface I18nContextValue {
  locale: Locale;
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
  const updatePreferences = useUserStore((state) => state.updatePreferences);

  useEffect(() => {
    const cookieLocale = getCookie(LOCALE_KEY) as Locale | null;
    if (cookieLocale && dictionaries[cookieLocale]) {
      setLocaleState(cookieLocale);
      return;
    }
    const stored = window.localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (stored && dictionaries[stored]) {
      setLocaleState(stored);
      setCookie(LOCALE_KEY, stored);
      return;
    }
    const browser = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
    let detected: Locale = 'en';
    if (browser.startsWith('es')) detected = 'es';
    else if (browser.startsWith('zh')) detected = 'zh';
    setLocaleState(detected);
    setCookie(LOCALE_KEY, detected);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_KEY, locale);
    setCookie(LOCALE_KEY, locale);
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
      setLocale: handleSetLocale,
      t: (key: string, params?: Record<string, string | number>) => {
        const val = getNestedValue(dictionaries[locale], key);
        if (typeof val === 'string') return interpolate(val, params);
        const fallback = getNestedValue(dictionaries.en, key);
        if (typeof fallback === 'string') return interpolate(fallback, params);
        return key;
      },
      tn: <T,>(key: string) => {
        const val = getNestedValue(dictionaries[locale], key);
        if (val !== undefined) return val as T;
        const fallback = getNestedValue(dictionaries.en, key);
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
        const val = getNestedValue(dictionaries[locale], key) ?? getNestedValue(dictionaries.en, key);
        const template = typeof val === 'string' ? val : key;
        const pluralSuffix = count === 1 ? '' : 's';
        return interpolate(template, { count, plural: pluralSuffix, ...params });
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

