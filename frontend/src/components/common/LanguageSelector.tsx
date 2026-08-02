'use client';

import React from 'react';
import { useI18n, type Locale } from '@/i18n';

const locales: Array<{ id: Locale; labelKey: string }> = [
  { id: 'en', labelKey: 'language.english' },
  { id: 'es', labelKey: 'language.spanish' },
  { id: 'zh', labelKey: 'language.chinese' },
];

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer group">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-current transition-colors"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="Language selector"
      >
        {locales.map((item) => (
          <option key={item.id} value={item.id} className="bg-zinc-900 text-white font-sans">
            {t(item.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
