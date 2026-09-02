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
 *   POST /api/v1/metrics/reset       — clear all metrics (admin use)
 *
 * The whole router is behind `requireMetricsAuth` (shared monitoring token) and
 * a sliding-window rate limit, consistent with the other operational
 * endpoints. See METRICS_DOCUMENTATION.md for metric names, units, dashboards
 * and alert thresholds.
 */

import { Router, Request, Response } from 'express';
import metricsCollector from '../metrics/MetricsCollector.js';
import {
  METRICS_SCHEMA_VERSION,
  PROMETHEUS_CONTENT_TYPE,
  buildMetricsSnapshot,
  renderPrometheus,
} from '../metrics/MetricsExporter.js';
import { requireMetricsAuth } from '../middleware/metricsAuth.js';
import { slidingWindowRateLimiter } from '../middleware/rateLimiter.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router: ReturnType<typeof Router> = Router();

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
  res.status(200).send(renderPrometheus());
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
  res.json({ status: 'success', data: metricsCollector.getErrorMetrics() });
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