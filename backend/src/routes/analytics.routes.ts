import { Router } from 'express';
import prisma from '../db/index.js';

const router = Router();

/**
 * @route GET /api/v1/analytics/global-stats
 * @desc Get global statistics from anonymized data
 * @access Public/Authenticated
 */
router.get('/global-stats', async (req, res) => {
  try {
    // Strictly querying the anonymized analytics_data table
    const stats = await (prisma as any).analyticsData.groupBy({
      by: ['metricType'],
      _count: {
        _all: true,
      },
      _avg: {
        value: true,
      },
    });

    const recentTrends = await (prisma as any).analyticsData.findMany({
      take: 10,
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        metricType: true,
        region: true,
        timestamp: true,
        category: true,
      },
    });

    res.json({
      status: 'success',
      data: {
        summary: stats,
        recentTrends: recentTrends,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch global statistics',
    });
  }
});

export default router;
