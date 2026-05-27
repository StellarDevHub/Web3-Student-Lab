import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import prisma from '../db/index.js';

const router = Router();

/**
 * @route   GET /api/v1/dashboard/activity
 * @desc    Get student engagement activity for heatmap
 * @access  Private
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.id;
    const days = 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch student's individual activities
    const studentActivities = await (prisma as any).studentActivity.findMany({
      where: {
        studentId,
        timestamp: {
          gte: startDate,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    // Fetch class average data (aggregated by day)
    // For performance in a real app, this would be pre-computed or cached
    const allActivities = await (prisma as any).studentActivity.groupBy({
      by: ['timestamp'],
      where: {
        timestamp: {
          gte: startDate,
        },
      },
      _count: {
        _all: true,
      },
    });

    const totalStudents = await prisma.student.count();

    // Process activities into a map of date -> {count, labs}
    const activityMap: Record<string, { count: number; labs: string[] }> = {};
    studentActivities.forEach((act: any) => {
      const dateStr = act.timestamp.toISOString().split('T')[0];
      if (!activityMap[dateStr]) {
        activityMap[dateStr] = { count: 0, labs: [] };
      }
      activityMap[dateStr].count += 1;
      activityMap[dateStr].labs.push(act.lessonId);
    });

    // Process average data
    const averageMap: Record<string, number> = {};
    allActivities.forEach((act: any) => {
      const dateStr = act.timestamp.toISOString().split('T')[0];
      const count = act._count?._all || 0;
      averageMap[dateStr] = totalStudents > 0 ? count / totalStudents : 0;
    });

    res.json({
      activities: Object.entries(activityMap).map(([date, data]) => ({
        date,
        count: data.count,
        labs: data.labs,
      })),
      classAverage: Object.entries(averageMap).map(([date, avg]) => ({
        date,
        count: avg,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch activity data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
