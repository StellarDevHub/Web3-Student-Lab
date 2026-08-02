import { Router } from 'express';
import { cbManager } from '../lib/circuit-breaker/CircuitBreakerManager.js';
import { checkDbHealth } from '../db/healthMonitor.js';

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
