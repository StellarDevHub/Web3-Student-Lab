import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import zh from '@/i18n/locales/zh.json';

type LocaleDictionary = Record<string, unknown>;
type ComparableLocale = 'es' | 'zh';

const referenceLocale = 'en';
const translatedLocales: Record<ComparableLocale, LocaleDictionary> = { es, zh };

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

describe('locale dictionary key parity', () => {
  it(`keeps Spanish and Chinese keys aligned with ${referenceLocale}.json`, () => {
    const issues = Object.entries(translatedLocales).flatMap(([localeName, dictionary]) =>
      diffLocaleKeys(localeName as ComparableLocale, dictionary)
    );

    expect(issues, issues.join('\n')).toEqual([]);
  });
});
