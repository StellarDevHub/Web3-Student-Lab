import { Router, type RequestHandler } from 'express';
import { checkReadiness } from '../db/readinessMonitor.js';
import { checkDeepReadiness } from '../db/deepReadiness.js';
import { cbManager } from '../lib/circuit-breaker/CircuitBreakerManager.js';
import { checkDbHealth } from '../db/healthMonitor.js';
import logger from '../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @openapi
 * /api/v1/health/circuit-breakers:
 *   get:
 *     summary: Get status of all circuit breakers
 *     description: Returns the current state of all circuit breakers in the system.
 *     tags: [Health]
 *     security: []
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
 * /api/v1/health/db:
 *   get:
 *     summary: Database health check
 *     description: Checks database connectivity with pool usage and latency metrics. Returns HTTP 200 when healthy or degraded, HTTP 503 when unreachable.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Database is healthy or degraded (still operational)
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
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [healthy, degraded, unhealthy]
 *                     latencyMs:
 *                       type: number
 *                       description: Round-trip time for SELECT 1
 *                     poolUsage:
 *                       type: object
 *                       properties:
 *                         active:
 *                           type: integer
 *                           description: Connections currently executing queries
 *                         idle:
 *                           type: integer
 *                           description: Connections waiting in pool
 *                         total:
 *                           type: integer
 *                           description: Pool capacity (DB_POOL_MAX env var)
 *                         utilizationPct:
 *                           type: number
 *                           description: active / total * 100
 *                     alerts:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Human-readable anomaly descriptions
 *                     checkedAt:
 *                       type: string
 *                       format: date-time
 *                       description: ISO timestamp of the check
 *       503:
 *         description: Database is unreachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/db', async (req, res) => {
  const health = await checkDbHealth();
  const httpStatus = health.status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json({ status: 'success', data: health });
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
 * @openapi
 * /api/v1/health/deep:
 *   get:
 *     summary: Deep readiness probe (DB, Redis, Soroban/Horizon block height, latency p50/p95/p99, memory)
 *     description: >
 *       Probes PostgreSQL, Redis and the Soroban/Horizon block height, and
 *       returns latency percentiles and process memory usage. Returns 503 when
 *       any dependency is unavailable. Useful for Kubernetes/Docker readiness
 *       where a reachable-but-stale RPC should fail the probe.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: All dependencies ready
 *       503:
 *         description: One or more dependencies unavailable
 */
const deepReadinessHandler: RequestHandler = async (_req, res) => {
  try {
    const result = await checkDeepReadiness();
    res.status(result.status === 'ready' ? 200 : 503).json(result);
  } catch (error) {
    logger.error('Deep readiness probe failed unexpectedly', error);
    res.status(503).json({
      status: 'not_ready',
      checks: {
        database: { status: 'unavailable', latencyMs: 0, error: 'database unavailable' },
        redis: { status: 'unavailable', latencyMs: 0, error: 'redis unavailable' },
        sorobanRpc: { status: 'unavailable', latencyMs: 0, error: 'soroban rpc unavailable' },
      },
      checkedAt: new Date().toISOString(),
    });
  }
};

router.get('/deep', deepReadinessHandler);

export default router;