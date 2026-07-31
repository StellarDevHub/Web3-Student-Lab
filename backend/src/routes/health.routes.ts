import { Router, type RequestHandler } from 'express';
import { checkReadiness } from '../db/readinessMonitor.js';
import { cbManager } from '../lib/circuit-breaker/CircuitBreakerManager.js';
import { checkDbHealth } from '../db/healthMonitor.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * /api/v1/health/circuit-breakers:
 *   get:
 *     summary: Get status of all circuit breakers
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 */
router.get('/circuit-breakers', (req, res) => {
  const stats = cbManager.getStats();
  res.json({
    status: 'success',
    data: stats,
  });
});

/**
 * @openapi
 * /api/v1/health/live:
 *   get:
 *     summary: Liveness probe
 *     description: Lightweight endpoint with no dependency calls. Succeeds while the process is alive.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Process is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 *                 timestamp:
 *                   type: string
 */
export const livenessHandler: RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
};

router.get('/live', livenessHandler);

/**
 * @openapi
 * /api/v1/health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Checks database and Redis capabilities with timeouts. Returns 503 when essential dependencies are unavailable.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All dependencies ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ready
 *                 checks:
 *                   type: object
 *                 checkedAt:
 *                   type: string
 *       503:
 *         description: One or more dependencies unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: not_ready
 *                 checks:
 *                   type: object
 *                 checkedAt:
 *                   type: string
 */
export const readinessHandler: RequestHandler = async (_req, res) => {
  try {
    const readiness = await checkReadiness();
    const httpStatus = readiness.status === 'ready' ? 200 : 503;
    res.status(httpStatus).json(readiness);
  } catch (error) {
    logger.error('Readiness probe failed unexpectedly', error);
    res.status(503).json({
      status: 'not_ready',
      checks: {
        database: { status: 'unavailable', latencyMs: 0, error: 'database unavailable' },
        redis: { status: 'unavailable', latencyMs: 0, error: 'redis unavailable' },
      },
      checkedAt: new Date().toISOString(),
    });
  }
};

router.get('/ready', readinessHandler);

/**
 * @route GET /api/v1/health/db
 * @desc Database connection health check with pool usage and latency metrics.
 *
 * Returns HTTP 200 when healthy/degraded (service is up but slow),
 * HTTP 503 when the database is unreachable.
 *
 * Response shape:
 * {
 *   status: 'healthy' | 'degraded' | 'unhealthy',
 *   latencyMs: number,          // round-trip time for SELECT 1
 *   poolUsage: {
 *     active: number,           // connections currently executing queries
 *     idle: number,             // connections waiting in pool
 *     total: number,            // pool capacity (DB_POOL_MAX env var)
 *     utilizationPct: number    // active / total * 100
 *   },
 *   alerts: string[],           // human-readable anomaly descriptions
 *   checkedAt: string           // ISO timestamp of the check
 * }
 */
router.get('/db', async (req, res) => {
  const health = await checkDbHealth();
  const httpStatus = health.status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json({ status: 'success', data: health });
});

export default router;
