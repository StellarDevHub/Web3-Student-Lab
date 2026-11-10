import en from './locales/en.json';

export const SUPPORTED_LOCALES = ['en', 'es', 'pt', 'zh', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export type LocaleBundle = Record<string, unknown>;

const bundleCache = new Map<Locale, LocaleBundle>([['en', en as LocaleBundle]]);

const dynamicLoaders: Record<Locale, () => Promise<LocaleBundle>> = {
  en: async () => en as LocaleBundle,
  es: async () => (await import('./locales/es.json')).default as LocaleBundle,
  pt: async () => (await import('./locales/pt.json')).default as LocaleBundle,
  zh: async () => (await import('./locales/zh.json')).default as LocaleBundle,
  fr: async () => (await import('./locales/fr.json')).default as LocaleBundle,
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Dynamically lazy-loads a translation dictionary chunk on demand and caches it in memory.
 */
export async function loadLocaleBundle(locale: Locale): Promise<LocaleBundle> {
  const cached = bundleCache.get(locale);
  if (cached) {
    return cached;
  }

  try {
    const loader = dynamicLoaders[locale] ?? dynamicLoaders[DEFAULT_LOCALE];
    const bundle = await loader();
    bundleCache.set(locale, bundle);
    return bundle;
  } catch {
    return en as LocaleBundle;
  }
}

export function getCachedLocaleBundle(locale: Locale): LocaleBundle {
  return bundleCache.get(locale) ?? (en as LocaleBundle);
}

export function primeLocaleBundleCache(locale: Locale, bundle: LocaleBundle): void {
  bundleCache.set(locale, bundle);
}

export function resolveNestedKey(dictionary: LocaleBundle, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dictionary);
}

/**
 * Resolves a dot-path translation key from the active locale bundle,
 * falling back to English (`en`) when a key is missing.
 */
export function resolveTranslationWithFallback(
  activeBundle: LocaleBundle,
  key: string,
  fallbackBundle: LocaleBundle = en as LocaleBundle
): unknown {
  const primary = resolveNestedKey(activeBundle, key);
  if (primary !== undefined) {
    return primary;
  }
  return resolveNestedKey(fallbackBundle, key);
}
