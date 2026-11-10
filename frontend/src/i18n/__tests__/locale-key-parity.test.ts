import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import pt from '@/i18n/locales/pt.json';
import zh from '@/i18n/locales/zh.json';
import fr from '@/i18n/locales/fr.json';
import {
  loadLocaleBundle,
  resolveTranslationWithFallback,
  SUPPORTED_LOCALES,
} from '@/i18n/config';

type LocaleDictionary = Record<string, unknown>;
type ComparableLocale = 'es' | 'pt' | 'zh' | 'fr';

const referenceLocale = 'en';
const translatedLocales: Record<ComparableLocale, LocaleDictionary> = {
  es,
  pt,
  zh,
  fr,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

function collectKeyPaths(value: unknown, parent = ''): string[] {
  if (Array.isArray(value)) {
    if (!value.some(isRecord)) {
      return parent ? [parent] : [];
    }

    return value.flatMap((child, index) => {
      const path = `${parent}[${index}]`;
      return isRecord(child) || Array.isArray(child) ? collectKeyPaths(child, path) : [path];
    });
  }

  if (!isRecord(value)) {
    return parent ? [parent] : [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = formatPath(parent, key);

    if (isRecord(child) || Array.isArray(child)) {
      return collectKeyPaths(child, path);
    }

    return [path];
  });
}

function diffLocaleKeys(localeName: ComparableLocale, dictionary: LocaleDictionary): string[] {
  const referencePaths = new Set(collectKeyPaths(en));
  const localePaths = new Set(collectKeyPaths(dictionary));

  const missing = [...referencePaths]
    .filter((path) => !localePaths.has(path))
    .map((path) => `missing key in ${localeName}: ${path}`);

  const unexpected = [...localePaths]
    .filter((path) => !referencePaths.has(path))
    .map((path) => `unexpected key in ${localeName}: ${path}`);

  return [...missing, ...unexpected].sort();
}

describe('locale dictionary key parity & dynamic bundle loader', () => {
  it(`keeps Spanish, Portuguese, Chinese, and French keys 100% aligned with ${referenceLocale}.json`, () => {
    const issues = Object.entries(translatedLocales).flatMap(([localeName, dictionary]) =>
      diffLocaleKeys(localeName as ComparableLocale, dictionary)
    );

    expect(issues, issues.join('\n')).toEqual([]);
  });

  it('dynamically loads all 5 supported locale bundles (en, es, pt, zh, fr)', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const bundle = await loadLocaleBundle(locale);
      expect(bundle).toBeDefined();
      expect(typeof (bundle.home as Record<string, unknown>)?.launch_app).toBe('string');
    }
  });

  it('falls back to English (en) when a key is missing in a partial bundle', () => {
    const partialBundle = { home: { launch_app: 'Iniciar App' } };
    expect(resolveTranslationWithFallback(partialBundle, 'home.launch_app')).toBe('Iniciar App');
    expect(resolveTranslationWithFallback(partialBundle, 'home.view_source')).toBe('View Source');
  });
});
