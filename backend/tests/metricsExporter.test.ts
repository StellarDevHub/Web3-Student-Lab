/**
 * Tests for the production metrics export: stable schema, safe labels and the
 * authorization applied to the operational endpoints.
 */

import express from 'express';
import request from 'supertest';
import metricsCollector from '../src/metrics/MetricsCollector.js';
import workerRegistry from '../src/metrics/WorkerRegistry.js';
import {
  METRICS_SCHEMA_VERSION,
  buildMetricsSnapshot,
  normalizeRouteLabel,
  renderPrometheus,
} from '../src/metrics/MetricsExporter.js';
import metricsRouter from '../src/routes/metrics.routes.js';
import { requireMetricsAuth } from '../src/middleware/metricsAuth.js';

describe('MetricsExporter.normalizeRouteLabel', () => {
  it('replaces identifier-looking segments so labels stay bounded', () => {
    expect(normalizeRouteLabel('/api/v1/certificates/4242/metadata')).toBe(
      '/api/v1/certificates/:id/metadata'
    );
    expect(
      normalizeRouteLabel('/api/v1/students/ckq1x8z9a0000abcdefghijkl/certificates')
    ).toBe('/api/v1/students/:id/certificates');
    expect(
      normalizeRouteLabel('/api/v1/users/9f1c2e3a-6b74-4c0f-9a5c-7b1d2e3f4a5b')
    ).toBe('/api/v1/users/:id');
  });

  it('leaves plain routes and query strings alone', () => {
    expect(normalizeRouteLabel('/api/v1/courses')).toBe('/api/v1/courses');
    expect(normalizeRouteLabel('/api/v1/courses?userId=abc')).toBe('/api/v1/courses');
  });
});

describe('metrics snapshot', () => {
  beforeEach(() => {
    metricsCollector.reset();
    workerRegistry.reset();
  });

  it('exposes a versioned schema with cache, http, error and worker sections', () => {
    metricsCollector.recordRequest('GET', '/api/v1/certificates/4242', 25, 200);
    metricsCollector.recordError('ValidationError', 'student email is invalid', 400);
    workerRegistry.register('storage-pin', { concurrency: 10 });

    const snapshot = buildMetricsSnapshot();

    expect(snapshot.schemaVersion).toBe(METRICS_SCHEMA_VERSION);
    expect(snapshot.http.requestsTotal).toBe(1);
    expect(snapshot.http.requestsByRoute).toEqual({ 'GET /api/v1/certificates/:id': 1 });
    expect(snapshot.http.requestsByStatusClass).toEqual({ '2xx': 1 });
    expect(snapshot.errors.errorsByType).toEqual({ ValidationError: 1 });
    expect(snapshot.cache).toEqual(
      expect.objectContaining({ hitsTotal: expect.any(Number), hitRatio: expect.any(Number) })
    );
    expect(snapshot.workers).toEqual([
      expect.objectContaining({ name: 'storage-pin', state: 'running', concurrency: 10 }),
    ]);
  });

  it('never carries error messages or request payloads', () => {
    metricsCollector.recordError('ValidationError', 'student email is invalid', 400);
    metricsCollector.recordEvent('user.registered', { email: 'leak@example.com' });

    const serialized = JSON.stringify(buildMetricsSnapshot());

    expect(serialized).not.toContain('student email is invalid');
    expect(serialized).not.toContain('leak@example.com');
  });
});

describe('prometheus rendering', () => {
  beforeEach(() => {
    metricsCollector.reset();
    workerRegistry.reset();
  });

  it('emits HELP and TYPE lines with units in the metric names', () => {
    metricsCollector.recordRequest('GET', '/api/v1/courses', 10, 200);
    workerRegistry.register('webhook-delivery');
    workerRegistry.recordFailed('webhook-delivery');

    const text = renderPrometheus();

    expect(text).toContain('# HELP w3sl_cache_hit_ratio');
    expect(text).toContain('# TYPE w3sl_cache_hits_total counter');
    expect(text).toContain('w3sl_http_requests_total{method="GET",route="/api/v1/courses"} 1');
    expect(text).toContain('w3sl_http_responses_total{status_class="2xx"} 1');
    expect(text).toContain('w3sl_worker_up{worker="webhook-delivery",state="running"} 1');
    expect(text).toContain('w3sl_worker_jobs_failed_total{worker="webhook-delivery"} 1');
    expect(text).toContain('w3sl_process_uptime_seconds');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('escapes label values so exposition output cannot be broken', () => {
    metricsCollector.recordError('Weird"Error\nType', 'ignored');

    const text = renderPrometheus();

    expect(text).toContain('w3sl_errors_total{type="Weird\\"Error Type"} 1');
  });
});

describe('metrics endpoints', () => {
  const app = express();
  app.use(express.json());
  app.use('/metrics', metricsRouter);

  beforeEach(() => {
    metricsCollector.reset();
    workerRegistry.reset();
  });

  it('serves the prometheus exposition as text/plain', async () => {
    const res = await request(app).get('/metrics/prometheus');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# TYPE w3sl_process_uptime_seconds gauge');
  });

  it('serves the JSON snapshot with its schema version', async () => {
    const res = await request(app).get('/metrics/snapshot');

    expect(res.status).toBe(200);
    expect(res.body.schemaVersion).toBe(METRICS_SCHEMA_VERSION);
    expect(res.body.data).toHaveProperty('cache');
    expect(res.body.data).toHaveProperty('workers');
  });

  it('redacts error messages from the raw error listing', async () => {
    metricsCollector.recordError('ValidationError', 'student email is invalid', 400);

    const res = await request(app).get('/metrics/errors');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({
      type: 'ValidationError',
      statusCode: 400,
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain('student email is invalid');
  });
});

describe('requireMetricsAuth', () => {
  const buildGuardedApp = () => {
    const app = express();
    app.get('/guarded', requireMetricsAuth, (_req, res) => res.json({ ok: true }));
    return app;
  };

  const originalToken = process.env.METRICS_AUTH_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.METRICS_AUTH_TOKEN;
    } else {
      process.env.METRICS_AUTH_TOKEN = originalToken;
    }
  });

  it('rejects requests without the configured token', async () => {
    process.env.METRICS_AUTH_TOKEN = 'super-secret';

    const res = await request(buildGuardedApp()).get('/guarded');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('accepts the token via X-Metrics-Token', async () => {
    process.env.METRICS_AUTH_TOKEN = 'super-secret';

    const res = await request(buildGuardedApp())
      .get('/guarded')
      .set('X-Metrics-Token', 'super-secret');

    expect(res.status).toBe(200);
  });

  it('accepts the token via Authorization: Bearer', async () => {
    process.env.METRICS_AUTH_TOKEN = 'super-secret';

    const res = await request(buildGuardedApp())
      .get('/guarded')
      .set('Authorization', 'Bearer super-secret');

    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    process.env.METRICS_AUTH_TOKEN = 'super-secret';

    const res = await request(buildGuardedApp())
      .get('/guarded')
      .set('X-Metrics-Token', 'nope');

    expect(res.status).toBe(401);
  });
});
