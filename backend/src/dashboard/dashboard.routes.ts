import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import { getStudentDashboard, getStats } from './dashboard.service.js';
import { getAggregatedDashboardData } from '../services/bff.service.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get global platform statistics (Resilient with mock fallback)
 * @access  Public
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch {
    res.status(500).json({ error: 'Failed to fetch platform stats' });
  }
});

/**
 * @route   GET /api/dashboard/me
 * @desc    BFF aggregation endpoint: returns all dashboard data the frontend needs in one request.
 *          Runs data fetchers concurrently (Promise.all), uses 30s in-memory cache, and
 *          returns partial data if one module fails (graceful degradation).
 * @access  Private
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const aggregatedData = await getAggregatedDashboardData(studentId);
    res.json(aggregatedData);
  } catch (error) {
    logger.error('BFF /me endpoint failed:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

/**
 * @route   GET /api/dashboard/student/:studentId
 * @desc    Get accurate student profile and achievements aggregated from all modules
 * @access  Public (should apply auth globally later)
 */
router.get('/student/:studentId', async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    if (!studentId || typeof studentId !== 'string') {
      res.status(400).json({ error: 'Student ID is required and must be a string' });
      return;
    }

    // Unified student profile view across Learning, Blockchain, Token
    const dashboard = await getStudentDashboard(studentId);

    res.json(dashboard);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Student not found') {
      res.status(404).json({ error: 'Student Profile not found' });
    } else {
      res.status(500).json({ error: 'Internal server error while fetching dashboard' });
    }
  }
});

// Modular route export
export default router;
