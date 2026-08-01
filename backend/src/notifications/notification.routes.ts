import { Router, Request, Response } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from './NotificationService.js';

const router = Router();

/**
 * GET /api/notifications
 *
 * Retrieve course notifications for the authenticated user.
 * Query params:
 *   - userId (string, required) — the current user's id
 *
 * Responses:
 *   200 - { notifications, total, unreadCount }
 *   400 - Missing userId parameter
 */
router.get('/', (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;

  if (!userId) {
    return res.status(400).json({ error: 'Missing required query parameter: userId' });
  }

  const result = getNotifications(userId);
  return res.json(result);
});

/**
 * PUT /api/notifications/:id/read
 *
 * Mark a single notification as read.
 *
 * Responses:
 *   200 - { success: true }
 *   404 - Notification not found
 */
router.put('/:id/read', (req: Request, res: Response) => {
  const { id } = req.params;
  const found = markAsRead(id);

  if (!found) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  return res.json({ success: true });
});

/**
 * PUT /api/notifications/read-all
 *
 * Mark all notifications for a user as read.
 * Body:
 *   - userId (string, required)
 *
 * Responses:
 *   200 - { success: true, updatedCount: number }
 *   400 - Missing userId in body
 */
router.put('/read-all', (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    return res.status(400).json({ error: 'Missing required field: userId' });
  }

  const updatedCount = markAllAsRead(userId);
  return res.json({ success: true, updatedCount });
});

export default router;
