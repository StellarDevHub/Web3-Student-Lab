/**
 * BE-077 — Prometheus custom metrics exporter.
 *
 * Covers the metric contract (names, labels and units that the dashboards and
 * alerts query), the queue-depth refresh/caching path, the HTTP latency
 * middleware's route labelling, and basic auth on `GET /metrics`.
 */

import express from 'express';
import request from 'supertest';

import {
  LEDGER_CLOSE_INTERVAL_SECONDS,
  bullmqQueueWaitingJobsCount,
  prometheusRegistry,
  recordSorobanIndexerLedgerLag,
  recordSorobanIndexerProgress,
  recordWasmEvaluation,
  resetPrometheusMetrics,
} from '../src/metrics/prometheusMetrics.js';
import {
  refreshBullmqQueueMetrics,
  setQueueDepthLoader,
} from '../src/metrics/queueDepthMetrics.js';
import { prometheusHttpMetrics } from '../src/middleware/prometheusHttpMetrics.js';
import { prometheusBasicRouter } from '../src/routes/metrics.routes.js';

describe('prometheus metric contract', () => {
  beforeEach(() => {
    resetPrometheusMetrics();
    setQueueDepthLoader(async () => []);
    delete process.env.PROMETHEUS_QUEUE_METRICS_TTL_MS;
  });

  afterAll(() => {
    setQueueDepthLoader();
  });

  it('registers the four required custom metrics', async () => {
    const metrics = await prometheusRegistry.metrics();

    expect(metrics).toContain('# TYPE soroban_indexer_ledger_lag_seconds gauge');
    expect(metrics).toContain('# TYPE bullmq_queue_waiting_jobs_count gauge');
    expect(metrics).toContain('# TYPE wasm_evaluation_duration_seconds histogram');
    expect(metrics).toContain('# TYPE http_request_duration_seconds histogram');
  });

  it('converts indexer ledger lag into seconds', async () => {
    recordSorobanIndexerProgress('soroban-events', 1_000, 1_004);

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain(
      `soroban_indexer_ledger_lag_seconds{indexer="soroban-events"} ${
        4 * LEDGER_CLOSE_INTERVAL_SECONDS
      }`
    );
  });

  it('clamps an indexer ahead of the network head to zero lag', async () => {
    recordSorobanIndexerLedgerLag('soroban-events', -3);

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('soroban_indexer_ledger_lag_seconds{indexer="soroban-events"} 0');
  });

  it('records WASM evaluation duration with outcome labels', async () => {
    recordWasmEvaluation('passed', 'completed', 0.42);

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain(
      'wasm_evaluation_duration_seconds_count{status="passed",termination_reason="completed"} 1'
    );
    expect(metrics).toContain(
      'wasm_evaluation_duration_seconds_sum{status="passed",termination_reason="completed"} 0.42'
    );
  });
});

describe('BullMQ queue depth refresh', () => {
  beforeEach(() => {
    resetPrometheusMetrics();
    delete process.env.PROMETHEUS_QUEUE_METRICS_TTL_MS;
  });

  afterEach(() => {
    setQueueDepthLoader();
  });

  it('publishes waiting-job counts per queue', async () => {
    setQueueDepthLoader(async () => [
      { queue: 'tx-minting', waiting: 12 },
      { queue: 'contract-evaluation', waiting: 3 },
    ]);

    await refreshBullmqQueueMetrics({ force: true });

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('bullmq_queue_waiting_jobs_count{queue="tx-minting"} 12');
    expect(metrics).toContain('bullmq_queue_waiting_jobs_count{queue="contract-evaluation"} 3');
  });

  it('caches samples for the TTL and refreshes when forced', async () => {
    let waiting = 7;
    setQueueDepthLoader(async () => [{ queue: 'tx-minting', waiting }]);

    await refreshBullmqQueueMetrics({ force: true });
    waiting = 40;
    await refreshBullmqQueueMetrics();

    let metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('bullmq_queue_waiting_jobs_count{queue="tx-minting"} 7');

    await refreshBullmqQueueMetrics({ force: true });
    metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('bullmq_queue_waiting_jobs_count{queue="tx-minting"} 40');
  });

  it('keeps the last known value when the queue source times out', async () => {
    setQueueDepthLoader(() => new Promise(() => undefined));

    await expect(refreshBullmqQueueMetrics({ force: true, timeoutMs: 20 })).resolves.toBeUndefined();

    // A previously published sample is untouched by the failed refresh.
    bullmqQueueWaitingJobsCount.set({ queue: 'tx-minting' }, 9);
    await refreshBullmqQueueMetrics({ force: true, timeoutMs: 20 });

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('bullmq_queue_waiting_jobs_count{queue="tx-minting"} 9');
  });
});

describe('HTTP request duration middleware', () => {
  beforeEach(() => {
    resetPrometheusMetrics();
  });

  it('labels observations with the matched route pattern, not the raw URL', async () => {
    const app = express();
    app.use(prometheusHttpMetrics());
    app.get('/api/v1/certificates/:id', (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).get('/api/v1/certificates/4242').expect(200);

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('route="/api/v1/certificates/:id"');
    expect(metrics).not.toContain('route="/api/v1/certificates/4242"');
    expect(metrics).toContain('status_class="2xx"');
  });

  it('collapses unmatched requests into one bounded series', async () => {
    const app = express();
    app.use(prometheusHttpMetrics());

    await request(app).get('/does-not-exist').expect(404);

    const metrics = await prometheusRegistry.metrics();
    expect(metrics).toContain('route="(unmatched)"');
    expect(metrics).toContain('status_class="4xx"');
  });
});

describe('GET /metrics', () => {
  const user = 'prometheus';
  const password = 'scrape-secret';

  const buildApp = () => {
    const app = express();
    app.use('/metrics', prometheusBasicRouter);
    return app;
  };

  beforeEach(() => {
    resetPrometheusMetrics();
    setQueueDepthLoader(async () => [{ queue: 'tx-minting', waiting: 0 }]);
    process.env.PROMETHEUS_BASIC_AUTH_USER = user;
    process.env.PROMETHEUS_BASIC_AUTH_PASSWORD = password;
    recordSorobanIndexerProgress('soroban-events', 100, 101);
  });

  afterEach(() => {
    delete process.env.PROMETHEUS_BASIC_AUTH_USER;
    delete process.env.PROMETHEUS_BASIC_AUTH_PASSWORD;
    setQueueDepthLoader();
  });

  it('rejects unauthenticated scrapes', async () => {
    const res = await request(buildApp()).get('/metrics').expect(401);

    expect(res.headers['www-authenticate']).toContain('Basic');
    expect(res.text).not.toContain('soroban_indexer_ledger_lag_seconds');
  });

  it('rejects invalid credentials', async () => {
    await request(buildApp())
      .get('/metrics')
      .auth(user, 'wrong-password')
      .expect(401);
  });

  it('serves the Prometheus exposition payload with valid basic auth', async () => {
    const res = await request(buildApp())
      .get('/metrics')
      .auth(user, password)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/^text\/plain;.*version=0\.0\.4/);
    expect(res.text).toContain('soroban_indexer_ledger_lag_seconds{indexer="soroban-events"} 5');
    expect(res.text).toContain('bullmq_queue_waiting_jobs_count{queue="tx-minting"} 0');
    expect(res.text).toContain('# TYPE http_request_duration_seconds histogram');
  });
});
