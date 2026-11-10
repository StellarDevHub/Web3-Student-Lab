'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';
import fr from './locales/fr.json';
import {
  DEFAULT_LOCALE,
  getCachedLocaleBundle,
  isSupportedLocale,
  loadLocaleBundle,
  Locale,
  LocaleBundle,
  primeLocaleBundleCache,
  resolveTranslationWithFallback,
} from './config';

export type { Locale } from './config';

// Seed cache while still supporting lazy dynamic bundle loading via loadLocaleBundle()
primeLocaleBundleCache('en', en as LocaleBundle);
primeLocaleBundleCache('es', es as LocaleBundle);
primeLocaleBundleCache('pt', pt as LocaleBundle);
primeLocaleBundleCache('zh', zh as LocaleBundle);
primeLocaleBundleCache('fr', fr as LocaleBundle);

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  get: <T = unknown>(key: string) => T | undefined;
  formatDate: (date: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (num: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (amount: number, currency?: string) => string;
  pluralize: (
    count: number,
    singularKey: string,
    pluralKey?: string,
    params?: Record<string, string | number>
  ) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'app:locale';
const COOKIE_NAME = 'app:locale';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [bundle, setBundle] = useState<LocaleBundle>(() => getCachedLocaleBundle(DEFAULT_LOCALE));

  useEffect(() => {
    const savedCookie = getCookie(COOKIE_NAME);
    const savedStorage =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const initial = savedCookie || savedStorage;

    if (isSupportedLocale(initial)) {
      setLocaleState(initial);
      void loadLocaleBundle(initial).then((loaded) => setBundle(loaded));
      if (savedCookie !== initial) setCookie(COOKIE_NAME, initial);
      if (savedStorage !== initial && typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, initial);
      }
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!isSupportedLocale(next)) return;
    setLocaleState(next);
    setBundle(getCachedLocaleBundle(next));
    void loadLocaleBundle(next).then((loaded) => setBundle(loaded));
    setCookie(COOKIE_NAME, next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const get = useCallback(
    <T = unknown,>(key: string): T | undefined => {
      return resolveTranslationWithFallback(bundle, key, en as LocaleBundle) as T | undefined;
    },
    [bundle]
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = get<unknown>(key);

      if (typeof value !== 'string') return key;

      if (!params) return value;

      return Object.entries(params).reduce(
        (str, [paramKey, paramVal]) =>
          str.replace(new RegExp(`{${paramKey}}`, 'g'), String(paramVal)),
        value
      );
    },
    [get]
  );

  const formatDate = useCallback(
    (date: Date | number | string, options?: Intl.DateTimeFormatOptions): string => {
      try {
        const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
        return new Intl.DateTimeFormat(locale, options).format(d);
      } catch {
        return String(date);
      }
    },
    [locale]
  );

  const formatNumber = useCallback(
    (num: number, options?: Intl.NumberFormatOptions): string => {
      try {
        return new Intl.NumberFormat(locale, options).format(num);
      } catch {
        return String(num);
      }
    },
    [locale]
  );

  const formatCurrency = useCallback(
    (amount: number, currency = 'USD'): string => {
      return formatNumber(amount, { style: 'currency', currency });
    },
    [formatNumber]
  );

  const pluralize = useCallback(
    (
      count: number,
      singularKey: string,
      pluralKey?: string,
      params?: Record<string, string | number>
    ): string => {
      try {
        const pr = new Intl.PluralRules(locale);
        const rule = pr.select(count);
        const targetKey = rule === 'one' ? singularKey : pluralKey || `${singularKey}_plural`;

        const mergedParams = {
          count,
          plural: count === 1 ? '' : 's',
          ...params,
        };
        return t(targetKey, mergedParams);
      } catch {
        return t(singularKey, { count, ...params });
      }
    },
    [locale, t]
  );

  return (
    <I18nContext.Provider
      value={{ locale, setLocale, t, get, formatDate, formatNumber, formatCurrency, pluralize }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
