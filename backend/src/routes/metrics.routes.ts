/**
 * Metrics Routes — exposes collected metrics to operational tooling.
 *
 * Endpoints:
 *   GET  /api/v1/metrics/prometheus  — Prometheus text exposition (scrape here)
 *   GET  /api/v1/metrics/snapshot    — same data as stable JSON
 *   GET  /api/v1/metrics             — aggregated summary (legacy shape)
 *   GET  /api/v1/metrics/performance — raw performance entries
 *   GET  /api/v1/metrics/errors      — error entries, messages redacted
 *   GET  /api/v1/metrics/business    — raw business event entries
 *   POST /api/v1/metrics             — ingest browser Web Vitals spans
 *   POST /api/v1/metrics/reset       — clear all metrics (admin use)
 *
 * Operational endpoints are behind `requireMetricsAuth` (shared monitoring
 * token) and a sliding-window rate limit. Browser telemetry ingestion is
 * separately rate-limited and accepts only a small allowlist of span fields.
 * See METRICS_DOCUMENTATION.md for details.
 */

import express, { Router, Request, Response } from 'express';
import metricsCollector from '../metrics/MetricsCollector.js';
import { normalizeRouteLabel } from '../metrics/MetricsExporter.js';
import {
  METRICS_SCHEMA_VERSION,
  PROMETHEUS_CONTENT_TYPE,
  buildMetricsSnapshot,
  renderPrometheus,
} from '../metrics/MetricsExporter.js';
import { renderTracingPrometheus } from '../metrics/prometheusExporter.js';
import {
  PROMETHEUS_CONTENT_TYPE as PROM_CLIENT_CONTENT_TYPE,
  renderPrometheusMetrics,
} from '../metrics/prometheusMetrics.js';
import { refreshBullmqQueueMetrics } from '../metrics/queueDepthMetrics.js';
import { requirePrometheusBasicAuth } from '../middleware/prometheusBasicAuth.js';
import { requireMetricsAuth } from '../middleware/metricsAuth.js';
import { slidingWindowRateLimiter } from '../middleware/rateLimiter.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

/**
 * Root scrape endpoint (BE-077). Mounted at `/metrics` by `src/index.ts`.
 *
 * Kept separate from the `/api/v1/metrics` router on purpose: Prometheus
 * scrapers expect the conventional root path, and it uses the `prom-client`
 * registry plus HTTP basic auth (the native `basic_auth` scrape configuration)
 * rather than the shared metrics token used by the API router.
 */
export const prometheusBasicRouter: ReturnType<typeof Router> = Router();

prometheusBasicRouter.use(requirePrometheusBasicAuth);

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Scrape application metrics in Prometheus format
 *     description: >
 *       Prometheus text exposition (version 0.0.4) of the custom metrics
 *       defined in `src/metrics/prometheusMetrics.ts` — Soroban indexer lag,
 *       BullMQ queue depth, WASM evaluation duration and HTTP latency — plus
 *       Node.js process metrics. Protected by HTTP basic auth.
 *     tags: [Metrics]
 *     security:
 *       - basicAuth: []
 *     responses:
 *       200:
 *         description: Prometheus exposition payload
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         description: Metrics basic auth credentials are not configured (production only)
 */
prometheusBasicRouter.get('/', async (_req: Request, res: Response) => {
  // Queue depth comes from BullMQ/Redis, so refresh it (TTL-cached) before
  // rendering rather than exposing the last scrape's value indefinitely.
  await refreshBullmqQueueMetrics();
  res.setHeader('Content-Type', PROM_CLIENT_CONTENT_TYPE);
  res.status(200).send(await renderPrometheusMetrics());
});

const router: ReturnType<typeof Router> = Router();

const CLIENT_SPAN_NAMES = new Set(['web-vital', 'route-change', 'slow-interaction']);
const CLIENT_SPAN_ATTRIBUTES = new Set([
  'web_vital.name',
  'web_vital.value',
  'web_vital.rating',
  'web_vital.id',
  'page.route',
  'device.hardware_concurrency',
  'device.memory_gb',
  'device.connection',
  'diagnostic.type',
  'diagnostic.component',
  'interaction.target',
  'interaction.type',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeClientAttributes(
  value: unknown
): Record<string, string | number | boolean> | null {
  if (!isRecord(value)) return null;
  const attributes: Record<string, string | number | boolean> = {};

  for (const [key, attribute] of Object.entries(value)) {
    if (!CLIENT_SPAN_ATTRIBUTES.has(key)) continue;
    if (typeof attribute === 'string') {
      attributes[key] = attribute.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
    } else if (typeof attribute === 'number' && Number.isFinite(attribute)) {
      attributes[key] = attribute;
    } else if (typeof attribute === 'boolean') {
      attributes[key] = attribute;
    }
  }

  return attributes;
}

router.post(
  '/',
  slidingWindowRateLimiter({
    windowMs: 60_000,
    limit: Number(process.env.CLIENT_METRICS_RATE_LIMIT || '120'),
    keyPrefix: 'client-metrics',
  }),
  express.text({ type: 'text/plain', limit: '16kb' }),
  (req: Request, res: Response) => {
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as unknown;
      } catch {
        return res.status(400).json({ status: 'error', message: 'Invalid client telemetry JSON' });
      }
    }

    const spans = isRecord(body) ? body['spans'] : undefined;
    if (!Array.isArray(spans) || spans.length === 0 || spans.length > 20) {
      return res.status(400).json({ status: 'error', message: 'Invalid client telemetry batch' });
    }

    const events: Array<{ name: string; attributes: Record<string, string | number | boolean> }> =
      [];
    for (const item of spans) {
      if (!isRecord(item) || typeof item.name !== 'string' || !CLIENT_SPAN_NAMES.has(item.name)) {
        return res.status(400).json({ status: 'error', message: 'Invalid client telemetry span' });
      }

      const attributes = sanitizeClientAttributes(item.attributes);
      if (
        !attributes ||
        typeof attributes['page.route'] !== 'string' ||
        !attributes['page.route'].startsWith('/')
      ) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Invalid client telemetry attributes' });
      }
      attributes['page.route'] = normalizeRouteLabel(attributes['page.route']);

      if (item.name === 'web-vital') {
        if (
          !['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].includes(String(attributes['web_vital.name'])) ||
          typeof attributes['web_vital.value'] !== 'number' ||
          attributes['web_vital.value'] < 0 ||
          !['good', 'needs-improvement', 'poor'].includes(String(attributes['web_vital.rating']))
        ) {
          return res
            .status(400)
            .json({ status: 'error', message: 'Invalid Web Vital measurement' });
        }
      }

      if (
        item.name === 'slow-interaction' &&
        (typeof attributes['web_vital.value'] !== 'number' || attributes['web_vital.value'] <= 200)
      ) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Invalid slow interaction diagnostic' });
      }

      events.push({ name: item.name, attributes });
    }

    for (const event of events) {
      const eventName =
        event.name === 'web-vital'
          ? 'client.web_vital'
          : event.name === 'slow-interaction'
            ? 'client.slow_interaction'
            : 'client.route_change';
      metricsCollector.recordEvent(eventName, event.attributes);
    }

    return res.status(202).json({ status: 'success', accepted: events.length });
  }
);

// Operational access controls: shared-secret auth + scrape rate ceiling.
router.use(requireMetricsAuth);
router.use(
  slidingWindowRateLimiter({
    windowMs: 60_000,
    limit: Number(process.env.METRICS_RATE_LIMIT || '120'),
    keyPrefix: 'rl:metrics',
  })
);

/**
 * @openapi
 * /api/v1/metrics/prometheus:
 *   get:
 *     summary: Scrape metrics in Prometheus text exposition format
 *     description: >
 *       Stable metric names with units in the name. Aggregates only — no request
 *       bodies, user identifiers or error messages. Route labels are normalised
 *       so resource identifiers are never exported.
 *     tags: [Metrics]
 *     security:
 *       - metricsToken: []
 *     responses:
 *       200:
 *         description: Prometheus exposition payload
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
router.get('/prometheus', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', PROMETHEUS_CONTENT_TYPE);
  res.status(200).send(`${renderPrometheus()}${renderTracingPrometheus()}`);
});

/**
 * @openapi
 * /api/v1/metrics/snapshot:
 *   get:
 *     summary: Get the stable JSON metrics snapshot
 *     description: >
 *       Same aggregation as the Prometheus endpoint, for tooling that prefers
 *       JSON. `schemaVersion` changes only on a breaking field change.
 *     tags: [Metrics]
 *     security:
 *       - metricsToken: []
 *     responses:
 *       200:
 *         description: Metrics snapshot
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/snapshot', (_req: Request, res: Response) => {
  res.json({
    status: 'success',
    schemaVersion: METRICS_SCHEMA_VERSION,
    data: buildMetricsSnapshot(),
  });
});

/**
 * @openapi
 * /api/v1/metrics:
 *   post:
 *     summary: Ingest browser Web Vitals spans
 *     description: Accepts a bounded batch of allowlisted client-side telemetry attributes.
 *     tags: [Metrics]
 *     requestBody:
 *       required: true
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *             example: '{"spans":[{"name":"web-vital","attributes":{"web_vital.name":"LCP","web_vital.value":1800,"web_vital.rating":"good","page.route":"/"}}]}'
 *     responses:
 *       202:
 *         description: Telemetry accepted
 *       400:
 *         description: Invalid telemetry payload
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 *   get:
 *     summary: Get aggregated metrics summary
 *     description: Public endpoint returning high-level aggregated metrics. No raw or sensitive data.
 *     tags: [Metrics]
 *     security:
 *       - metricsToken: []
 *     responses:
 *       200:
 *         description: Metrics summary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'success', data: metricsCollector.getSummary() });
});

/**
 * @openapi
 * /api/v1/metrics/performance:
 *   get:
 *     summary: Get raw performance metrics
 *     description: Administrator only. Returns raw performance metric entries.
 *     tags: [Metrics]
 *     security:
 *       - metricsToken: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Raw performance metrics
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
router.get('/performance', authenticateToken, requireAdmin, (_req: Request, res: Response) => {
  res.json({ status: 'success', data: metricsCollector.getPerformanceMetrics() });
});

/**
 * @openapi
 * /api/v1/metrics/errors:
 *   get:
 *     summary: Get raw error metrics
 *     description: Administrator only. Returns raw error metric entries.
 *     tags: [Metrics]
 *     security:
 *       - metricsToken: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Raw error metrics
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
router.get('/errors', authenticateToken, requireAdmin, (_req: Request, res: Response) => {
  const sanitizedErrors = metricsCollector.getErrorMetrics().map(({ message: _m, ...rest }) => rest);
  res.json({ status: 'success', data: sanitizedErrors });
});

/**
 * @openapi
 * /api/v1/metrics/business:
 *   get:
 *     summary: Get raw business event metrics
 *     description: Administrator only. Returns raw business metric entries.
 *     tags: [Metrics]
 *     security:
 *       - metricsToken: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Raw business metrics
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
router.get('/business', authenticateToken, requireAdmin, (_req: Request, res: Response) => {
  res.json({ status: 'success', data: metricsCollector.getBusinessMetrics() });
});

/**
 * @openapi
 * /api/v1/metrics/reset:
 *   post:
 *     summary: Reset all collected metrics
 *     description: Administrator only. Clears all in-memory metrics.
 *     tags: [Metrics]
 *     security:
 *       - metricsToken: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics reset successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
router.post('/reset', authenticateToken, requireAdmin, (_req: Request, res: Response) => {
  metricsCollector.reset();
  res.json({ status: 'success', message: 'Metrics reset successfully' });
});

export default router;
