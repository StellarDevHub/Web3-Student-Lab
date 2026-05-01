"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import zh from "@/i18n/locales/zh.json";

export type Locale = "en" | "es" | "zh";
type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = { en, es, zh };
const LOCALE_KEY = "app:locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (stored && dictionaries[stored]) {
      setLocaleState(stored);
      return;
    }
    const browser = navigator.language.toLowerCase();
    if (browser.startsWith("es")) setLocaleState("es");
    else if (browser.startsWith("zh")) setLocaleState("zh");
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key: string) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
