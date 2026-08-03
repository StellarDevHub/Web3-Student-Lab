import { Request, Response, NextFunction } from 'express';
import { createI18nMiddleware, resolveLocale } from '../i18n.js';
import { InMemoryTranslationRepository } from '../../services/i18n/translation.repository.js';

describe('resolveLocale', () => {
  it('resolves locale from query parameter if supported', () => {
    const req = { query: { locale: 'es' }, headers: {} } as unknown as Request;
    const locale = resolveLocale(req, ['en', 'es', 'fr'], 'en');
    expect(locale).toBe('es');
  });

  it('falls back to header if query param unsupported', () => {
    const req = { query: { locale: 'de' }, headers: { 'accept-language': 'fr-FR,fr;q=0.9' } } as unknown as Request;
    const locale = resolveLocale(req, ['en', 'es', 'fr'], 'en');
    expect(locale).toBe('fr');
  });

  it('falls back to default if header and query are unsupported', () => {
    const req = { query: {}, headers: { 'accept-language': 'de-DE,de;q=0.9' } } as unknown as Request;
    const locale = resolveLocale(req, ['en', 'es', 'fr'], 'en');
    expect(locale).toBe('en');
  });

  it('handles array headers safely', () => {
    const req = { query: {}, headers: { 'accept-language': ['es-ES,es;q=0.9', 'en-US'] } } as unknown as Request;
    const locale = resolveLocale(req, ['en', 'es', 'fr'], 'en');
    expect(locale).toBe('es');
  });
});

describe('createI18nMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      headers: {},
      query: {},
    };
    res = {};
    next = jest.fn();
  });

  it('adds locale and translation function to request', async () => {
    const repo = new InMemoryTranslationRepository([
      { locale: 'en', namespace: 'platform', key: 'welcome', value: 'Welcome' },
      { locale: 'es', namespace: 'platform', key: 'welcome', value: 'Bienvenido' },
    ]);

    const middleware = createI18nMiddleware({
      repository: repo,
      supportedLocales: ['en', 'es'],
      defaultLocale: 'en',
    });

    req.headers = { 'accept-language': 'es-ES' };

    await middleware(req as Request, res as Response, next);

    expect(req.locale).toBe('es');
    expect(req.translationNamespace).toBe('platform');
    expect(req.t).toBeDefined();
    expect(req.t!('welcome')).toBe('Bienvenido');
    expect(next).toHaveBeenCalled();
  });

  it('safely handles missing translation keys by returning the key', async () => {
    const repo = new InMemoryTranslationRepository([]);

    const middleware = createI18nMiddleware({
      repository: repo,
    });

    await middleware(req as Request, res as Response, next);

    expect(req.t!('missing.key')).toBe('missing.key');
    expect(next).toHaveBeenCalled();
  });
});
