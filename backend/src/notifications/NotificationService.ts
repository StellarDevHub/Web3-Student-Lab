import redisClient from '../cache/RedisClient.js';

import logger from '../utils/logger.js';
import {
    CourseNotification,
    CreateCourseNotificationDto,
    NotificationListResponse
} from './notification.types.js';

/**
 * In-memory notification store keyed by user id (or 'broadcast' for global).
 *
 * In a production environment this would be backed by PostgreSQL (via Prisma)
 * and Redis for fast reads.  For the MVP the in-memory store is sufficient
 * while keeping the API shape identical to what a DB-backed version would use.
 */
const store = new Map<string, CourseNotification[]>();

let counter = 0;

/**
 * Reset the in-memory store — used by tests to get a clean slate.
 */
export function resetStore(): void {
  store.clear();
  counter = 0;
}

/**
 * Generate a unique, lexicographically sortable notification id.
 */
function nextId(): string {
  counter += 1;
  return `notif-${Date.now()}-${counter}`;
}

function getKey(userId?: string): string {
  return userId ?? '__broadcast__';
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Create a course-related notification, persist it in the in-memory store and
 * broadcast it through Redis Pub/Sub so every backend instance (and the
 * WebSocket gateway) can relay it to connected clients.
 */
export async function createNotification(
  dto: CreateCourseNotificationDto,
): Promise<CourseNotification> {
  const notification: CourseNotification = {
    id: nextId(),
    type: dto.type,
    title: dto.title,
    message: dto.message,
    read: false,
    createdAt: new Date().toISOString(),
  };
  if (dto.userId) notification.userId = dto.userId;
  if (dto.courseId) notification.courseId = dto.courseId;
  if (dto.courseTitle) notification.courseTitle = dto.courseTitle;
  if (dto.metadata) notification.metadata = dto.metadata;

  // Persist locally
  const key = getKey(dto.userId);
  const existing = store.get(key) ?? [];
  existing.unshift(notification);
  store.set(key, existing);

  // Broadcast so all server instances & connected WebSocket clients receive it.
  // No pub client means Redis is unavailable — the local store still holds it.
  try {
    const pubClient = redisClient.getPubClient();
    if (pubClient) {
      await pubClient.publish('course_notifications', JSON.stringify(notification));
    }
  } catch (err) {
    logger.warn('Failed to publish course_notification to Redis:', err);
  }

  logger.info(
    `Notification created [${dto.type}] ${dto.courseTitle ?? ''} — ${dto.title}`,
  );
  return notification;
}

/**
 * Retrieve notifications for a given user.
 * Returns both user-targeted and broadcast (global) notifications,
 * sorted newest-first.
 */
export function getNotifications(userId: string): NotificationListResponse {
  const userKey = getKey(userId);
  const broadcastKey = getKey(undefined);

  const userNotifs = store.get(userKey) ?? [];
  const broadcastNotifs = store.get(broadcastKey) ?? [];

  const all = mergeSorted(userNotifs, broadcastNotifs);
  const unreadCount = all.filter((n) => !n.read).length;

  return { notifications: all, total: all.length, unreadCount };
}

/**
 * Mark a single notification as read.
 * Returns true if the notification was found and updated.
 */
export function markAsRead(notificationId: string): boolean {
  for (const [, notifications] of store.entries()) {
    const idx = notifications.findIndex((n) => n.id === notificationId);
    const target = idx === -1 ? undefined : notifications[idx];
    if (target) {
      notifications[idx] = { ...target, read: true };

      return true;
    }
  }
  return false;
}

/**
 * Mark all notifications for a user (including broadcast ones) as read.
 */
export function markAllAsRead(userId: string): number {
  let count = 0;

  const userKey = getKey(userId);
  const broadcastKey = getKey(undefined);

  for (const key of [userKey, broadcastKey]) {
    const notifs = store.get(key);
    if (notifs) {
      for (let i = 0; i < notifs.length; i++) {
        const current = notifs[i];
        if (current && !current.read) {
          notifs[i] = { ...current, read: true };

          count++;
        }
      }
    }
  }

  return count;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Merge two pre-sorted (newest-first) arrays into a single
 * newest-first array, inserting at most `max` items.
 */
function mergeSorted(
  a: CourseNotification[],
  b: CourseNotification[],
  max = 200,
): CourseNotification[] {
  const result: CourseNotification[] = [];
  let i = 0;
  let j = 0;
  while (result.length < max && (i < a.length || j < b.length)) {
    const left = a[i];
    const right = b[j];

    if (!left) {
      j++;
      if (right) result.push(right);
    } else if (!right) {
      i++;
      result.push(left);
    } else if (left.createdAt >= right.createdAt) {
      i++;
      result.push(left);
    } else {
      j++;
      result.push(right);

    }
  }
  return result;
}
