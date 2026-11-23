import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createCorsMiddleware } from '../cors.config.js';

describe('CORS Configuration Middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects origin: null when origin header is "null"', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'null');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Origin not allowed' });
  });

  it('allows approved origin in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.studentlab.xyz';

    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'https://app.studentlab.xyz');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.studentlab.xyz');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects unapproved origin in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.studentlab.xyz';

    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/test')
      .set('Origin', 'https://malicious-site.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles OPTIONS preflight for allowed origin', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.studentlab.xyz';

    const app = express();
    app.use(createCorsMiddleware());
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .options('/test')
      .set('Origin', 'https://app.studentlab.xyz')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.studentlab.xyz');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });
});
