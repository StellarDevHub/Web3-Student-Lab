/**
 * Route-level tests for the versioned API error envelope.
 *
 * A minimal Express app is assembled from the real middleware so the contract
 * is exercised end-to-end without booting the whole server.
 */

import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '../src/middleware/validation.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { detailedRequestLogger } from '../src/middleware/requestLogger.js';
import { ApiError } from '../src/utils/apiError.js';

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().positive(),
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(detailedRequestLogger);

  app.post('/validated', validate(schema), (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/not-found', (_req, _res, next) => {
    next(ApiError.notFound('Certificate not found'));
  });

  app.get('/boom', (_req, _res, next) => {
    next(new Error('database password is hunter2'));
  });

  app.use(errorHandler);
  return app;
};

describe('API error envelope (routes)', () => {
  const app = buildApp();

  it('returns field errors for validation failures without leaking stack traces', async () => {
    const res = await request(app).post('/validated').send({ email: 'nope', age: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.version).toBe('1');
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.message).toBe('Request validation failed');
    expect(res.body.error.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'age' }),
      ])
    );

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('ZodError');
    expect(serialized).not.toMatch(/\bat .*\.ts:\d+/);
  });

  it('includes a correlation id on every error response', async () => {
    const res = await request(app).get('/not-found');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers['x-correlation-id']).toBe(res.body.error.requestId);
  });

  it('echoes an inbound X-Correlation-ID so clients can trace a failure', async () => {
    const res = await request(app)
      .get('/not-found')
      .set('X-Correlation-ID', 'trace-me-please');

    expect(res.body.error.requestId).toBe('trace-me-please');
  });

  it('hides internal failure detail behind a generic 500 message', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe(
      'An unexpected error occurred. Please try again later.'
    );
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('passes valid requests through untouched', async () => {
    const res = await request(app).post('/validated').send({ email: 'a@b.io', age: 21 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
