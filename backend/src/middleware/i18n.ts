import { NextFunction, Request, Response } from 'express';
import {
    PrismaTranslationRepository,
    TranslationRepository,
} from '../services/i18n/translation.repository.js';

declare global {
  namespace Express {
    interface Request {
      locale?: string;
      translationNamespace?: string;
      t?: (key: string) => string;
    }
  }
}

export interface I18nOptions {
  defaultLocale?: string;
  supportedLocales?: string[];
  namespace?: string;
  repository?: TranslationRepository;
}

const FALLBACK_LOCALE = 'en';

function parseAcceptLanguage(headerValue: string | string[] | undefined): string | null {
  if (!headerValue) {
    return null;
  }

  const headerStr = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  
  if (!headerStr) {
    return null;
  }

  const first = headerStr.split(',')[0]?.trim();
  if (!first) {
    return null;
  }

  const language = first.split(';')[0]?.trim();
  if (!language) {
    return null;
  }

  const normalized = language.split('-')[0]?.toLowerCase();
  return normalized || null;
}

function resolveLocale(req: Request, supportedLocales: string[], defaultLocale: string): string {
  const queryLocale =
    typeof req.query.locale === 'string'
      ? req.query.locale
      : typeof req.query.lang === 'string'
        ? req.query.lang
        : undefined;

  if (queryLocale) {
    const normalizedQuery = queryLocale.toLowerCase();
    if (supportedLocales.includes(normalizedQuery)) {
      return normalizedQuery;
    }
  }

  const fromHeader = parseAcceptLanguage(req.headers['accept-language']);
  if (fromHeader && supportedLocales.includes(fromHeader)) {
    return fromHeader;
  }

  return defaultLocale;
}

export function createI18nMiddleware(options: I18nOptions = {}) {
  const defaultLocale = options.defaultLocale ?? FALLBACK_LOCALE;
  const supportedLocales = options.supportedLocales ?? ['en', 'es', 'fr', 'de'];
  const namespace = options.namespace ?? 'platform';
  const repository = options.repository ?? new PrismaTranslationRepository();

  return async (req: Request, _res: Response, next: NextFunction) => {
    const locale = resolveLocale(req, supportedLocales, defaultLocale);

    try {
      const localeTable = await repository.getTranslations(locale, namespace);
      const fallbackTable =
        locale === defaultLocale
          ? localeTable
          : await repository.getTranslations(defaultLocale, namespace);

      req.locale = locale;
      req.translationNamespace = namespace;
      req.t = (key: string) => localeTable[key] ?? fallbackTable[key] ?? key;
    } catch {
      req.locale = defaultLocale;
      req.translationNamespace = namespace;
      req.t = (key: string) => key;
    }

    next();
  };
}

export { resolveLocale };
