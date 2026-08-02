import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import logger from '../utils/logger.js';
import { getUserActivityLog, recordActivity } from './activityLog.service.js';

const router = Router();

/**
 * @route   GET /api/v1/dashboard/activity-log
 * @desc    Get paginated activity log for the authenticated user
 * @access  Private
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

    const result = await getUserActivityLog(userId, page, pageSize);
    res.json({ status: 'success', data: result });
  } catch (error) {
    logger.error('GET /dashboard/activity-log failed', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch activity log' });
  }
});

/**
 * @route   POST /api/v1/dashboard/activity-log
 * @desc    Record a manual activity entry for the authenticated user
 * @access  Private
 */
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { action, entity, entityId, details } = req.body;

    if (!action || typeof action !== 'string') {
      res.status(400).json({ status: 'error', message: 'action is required' });
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    const entry = await recordActivity(userId, action, entity, entityId, details, ipAddress);
    res.status(201).json({ status: 'success', data: entry });
  } catch (error) {
    logger.error('POST /dashboard/activity-log failed', error);
    res.status(500).json({ status: 'error', message: 'Failed to record activity' });
  }
});

export default router;
