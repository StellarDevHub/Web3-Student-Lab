import { Router } from 'express';
import { cbManager } from '../lib/circuit-breaker/CircuitBreakerManager.js';

const router = Router();

/**
 * @route GET /api/v1/health/circuit-breakers
 * @desc Get status of all circuit breakers
 */
router.get('/circuit-breakers', (req, res) => {
  const stats = cbManager.getStats();
  res.json({
    status: 'success',
    data: stats,
  });
});

export default router;
