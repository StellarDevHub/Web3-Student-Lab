import { Router } from 'express';
import { cbManager } from '../lib/circuit-breaker/CircuitBreakerManager.js';

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

export default router;
