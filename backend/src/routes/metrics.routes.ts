/**
 * Metrics Routes — exposes collected metrics over HTTP.
 *
 * Endpoint classification:
 *   GET  /api/v1/metrics          — PUBLIC: aggregated summary (minimal, no sensitive fields)
 *   GET  /api/v1/metrics/performance — ADMIN ONLY: raw performance entries
 *   GET  /api/v1/metrics/errors      — ADMIN ONLY: raw error entries
 *   GET  /api/v1/metrics/business    — ADMIN ONLY: raw business event entries
 *   POST /api/v1/metrics/reset       — ADMIN ONLY: clear all metrics
 */

import { Router, Request, Response } from 'express';
import metricsCollector from '../metrics/MetricsCollector.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

/**
 * @openapi
 * /api/v1/metrics:
 *   get:
 *     summary: Get aggregated metrics summary
 *     description: Public endpoint returning high-level aggregated metrics. No raw or sensitive data.
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Metrics summary
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
