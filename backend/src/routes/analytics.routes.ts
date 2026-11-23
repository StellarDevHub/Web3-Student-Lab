import { Router } from 'express';
import prisma from '../db/index.js';
import { buildPaginatedResponse, parsePaginationQuery } from '../utils/pagination.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @route GET /api/v1/analytics/global-stats
 * @desc Get global statistics from anonymized data
 * @access Public/Authenticated
 */
router.get('/global-stats', async (req, res) => {
  try {
    const pagination = parsePaginationQuery(req, { defaultPageSize: 10, maxPageSize: 25 });

    const [stats, recentTrends, totalItems] = await Promise.all([
      (prisma as any).analyticsData.groupBy({
        by: ['metricType'],
        _count: {
          _all: true,
        },
        _avg: {
          value: true,
        },
      }),
      (prisma as any).analyticsData.findMany({
        take: pagination.pageSize,
        skip: pagination.offset,
        orderBy: {
          timestamp: 'desc',
        },
        select: {
          metricType: true,
          region: true,
          timestamp: true,
          category: true,
        },
      }),
      (prisma as any).analyticsData.count(),
    ]);

    res.json({
      status: 'success',
      data: {
        summary: stats,
        recentTrends: buildPaginatedResponse(recentTrends, totalItems, pagination.page, pagination.pageSize, pagination.offset),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch global statistics';
    res.status(message.includes('Page') || message.includes('Offset') ? 400 : 500).json({
      status: 'error',
      message,
    });
  }
});

export default router;
