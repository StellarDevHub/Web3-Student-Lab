import { Router, Request, Response } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from './NotificationService.js';
import { NotificationListResponse } from './notification.types.js';

const router: ReturnType<typeof Router> = Router();

/** Query string accepted by `GET /api/notifications`. */
interface ListNotificationsQuery {
  userId?: string;
}

/** Route params for `PUT /api/notifications/:id/read`. */
interface MarkAsReadParams {
  id: string;
}

/** Body accepted by `PUT /api/notifications/read-all`. */
interface MarkAllAsReadBody {
  userId?: string;
}

/** Error payload returned by the notification routes on 400/404. */
interface NotificationErrorResponse {
  error: string;
}

/** Success payload for the two mutation routes. */
interface MarkAsReadResponse {
  success: true;
}

interface MarkAllAsReadResponse extends MarkAsReadResponse {
  updatedCount: number;
}

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
router.get(
  '/',
  (
    req: Request<unknown, unknown, unknown, ListNotificationsQuery>,
    res: Response<NotificationListResponse | NotificationErrorResponse>
  ) => {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required query parameter: userId' });
    }

    const result = getNotifications(userId);
    return res.json(result);
  }
);

/**
 * PUT /api/notifications/:id/read
 *
 * Mark a single notification as read.
 *
 * Responses:
 *   200 - { success: true }
 *   404 - Notification not found
 */
router.put(
  '/:id/read',
  (
    req: Request<MarkAsReadParams>,
    res: Response<MarkAsReadResponse | NotificationErrorResponse>
  ) => {
    const { id } = req.params;
    const found = markAsRead(id);

    if (!found) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({ success: true });
  }
);

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
router.put(
  '/read-all',
  (
    req: Request<unknown, unknown, MarkAllAsReadBody>,
    res: Response<MarkAllAsReadResponse | NotificationErrorResponse>
  ) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const updatedCount = markAllAsRead(userId);
    return res.json({ success: true, updatedCount });
  }
);

export default router;
