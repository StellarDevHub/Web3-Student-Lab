"use client";

import React from "react";
import { useI18n, type Locale } from "@/i18n";

const locales: Array<{ id: Locale; labelKey: string }> = [
  { id: "en", labelKey: "language.english" },
  { id: "es", labelKey: "language.spanish" },
  { id: "zh", labelKey: "language.chinese" },
];

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  return (
    <select
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      className="rounded border border-white/20 bg-black px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-200"
      aria-label="Language selector"
    >
      {locales.map((item) => (
        <option key={item.id} value={item.id}>
          {t(item.labelKey)}
        </option>
      ))}
    </select>
  );
}
