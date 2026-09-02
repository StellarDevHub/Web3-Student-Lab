import { Router } from 'express';
import cacheService from './CacheService.js';
import redisClient from './RedisClient.js';
import { requireMetricsAuth } from '../middleware/metricsAuth.js';

const router: ReturnType<typeof Router> = Router();

// Cache metrics are operational data — same authorization as /api/v1/metrics.
router.use(requireMetricsAuth);

router.get('/metrics', (_req, res) => {
  const metrics = cacheService.getMetrics();
  const isHealthy = redisClient.isHealthy();

  res.json({
    redis: {
      connected: isHealthy,
      status: isHealthy ? 'healthy' : 'disconnected',
    },
    cache: metrics,
  });
});

router.post('/metrics/reset', (_req, res) => {
  cacheService.resetMetrics();
  res.json({ message: 'Cache metrics reset successfully' });
});

export default router;
