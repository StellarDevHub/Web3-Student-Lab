import express from 'express';
import request from 'supertest';
import { createI18nMiddleware } from '../src/middleware/i18n.js';
import { InMemoryTranslationRepository } from '../src/services/i18n/translation.repository.js';

describe('i18n middleware locale routing', () => {
  const repository = new InMemoryTranslationRepository([
    { locale: 'en', namespace: 'platform', key: 'welcome', value: 'Welcome' },
    { locale: 'es', namespace: 'platform', key: 'welcome', value: 'Bienvenido' },
    { locale: 'en', namespace: 'platform', key: 'dashboard', value: 'Dashboard' },
  ]);

  function buildApp() {
    const app = express();
    app.use(
      createI18nMiddleware({
        repository,
        defaultLocale: 'en',
        supportedLocales: ['en', 'es'],
      })
    );

    app.get('/message', (req, res) => {
      const key = typeof req.query.key === 'string' ? req.query.key : 'welcome';
      res.json({ locale: req.locale, value: req.t?.(key) });
    });

    return app;
  }

  it('uses locale from query param over headers', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/message?locale=es&key=welcome')
      .set('accept-language', 'en-US,en;q=0.9');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ locale: 'es', value: 'Bienvenido' });
  });

  it('falls back to default locale when unsupported language requested', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/message?locale=pt&key=welcome')
      .set('accept-language', 'pt-BR,pt;q=0.9');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ locale: 'en', value: 'Welcome' });
  });

  it('falls back to english key when translation is missing in locale', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/message?locale=es&key=dashboard')
      .set('accept-language', 'es-ES,es;q=0.9');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ locale: 'es', value: 'Dashboard' });
  });
});
