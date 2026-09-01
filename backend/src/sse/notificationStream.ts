import { Response } from 'express';
import redisClient from '../cache/RedisClient.js';
import logger from '../utils/logger.js';
import { sseSessionManager } from './SseSessionManager.js';

/**
 * Real-time course notification SSE bridge (#1122).
 *
 * Subscribes to the `course_notifications` Redis Pub/Sub channel (the same
 * channel `NotificationService.createNotification` publishes to) and relays
 * each event to the connected SSE clients of the targeted user, or to all
 * clients when the notification is a broadcast (no `userId`).
 *
 * Reconnection recovery: every delivered event carries an `id:` line. The
 * bridge keeps a small per-user ring buffer of recently delivered events so
 * a client that reconnects with a `Last-Event-ID` header can be replayed the
 * events it missed while disconnected.
 */

export const NOTIFICATIONS_CHANNEL = 'course_notifications';

/** Max events kept per user for `Last-Event-ID` replay. */
export const RECENT_EVENTS_PER_USER = 100;

interface RecentNotification {
  id: string;
  event: string;
  data: string;
}

const recentByUser = new Map<string, RecentNotification[]>();

let bridgeStarted = false;

/**
 * Remember a delivered notification for `Last-Event-ID` replay. Broadcasts
 * (no userId) are remembered under the `__broadcast__` key.
 */
function remember(userId: string | undefined, entry: RecentNotification): void {
  const key = userId ?? '__broadcast__';
  const list = recentByUser.get(key) ?? [];
  list.push(entry);
  while (list.length > RECENT_EVENTS_PER_USER) {
    list.shift();
  }
  recentByUser.set(key, list);
}

function parseNotification(raw: string): RecentNotification | null {
  try {
    const parsed = JSON.parse(raw) as { id?: string; type?: string };
    if (!parsed.id) {
      return null;
    }
    return {
      id: parsed.id,
      event: parsed.type ?? 'notification',
      data: raw,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a `course_notifications` Redis message, remember it for replay, and
 * forward it to the connected SSE clients (targeted or broadcast).
 *
 * Exported separately so the emit/remember logic can be unit-tested without
 * a live Redis connection.
 */
export function forwardNotification(rawMessage: string): boolean {
  const entry = parseNotification(rawMessage);
  if (!entry) {
    return false;
  }

  let userId: string | undefined;
  let payload: unknown;
  try {
    payload = JSON.parse(rawMessage);
    userId = (payload as { userId?: string }).userId;
  } catch {
    payload = rawMessage;
  }

  remember(userId, entry);
  if (userId) {
    sseSessionManager.emitToUser(userId, entry.event, payload, entry.id);
  } else {
    // Broadcast to every connected client (#1122).
    sseSessionManager.emitToAll(entry.event, payload, entry.id);
  }
  return true;
}

/**
 * Subscribe to the notifications channel and forward events to connected SSE
 * clients. Idempotent: safe to call from multiple modules / during tests.
 *
 * Returns an unsubscribe function.
 */
export function startNotificationStreamBridge(): () => void {
  const subClient = redisClient.getSubClient();

  if (!subClient) {
    logger.warn(
      '[notification-stream] Redis unavailable — SSE notifications will not be bridged',
    );
    return () => undefined;
  }

  if (bridgeStarted) {
    return () => undefined;
  }
  bridgeStarted = true;

  const onMessage = (channel: string, message: string): void => {
    if (channel !== NOTIFICATIONS_CHANNEL) {
      return;
    }
    forwardNotification(message);
  };

  subClient.subscribe(NOTIFICATIONS_CHANNEL);
  subClient.on('message', onMessage);

  return () => {
    subClient.unsubscribe(NOTIFICATIONS_CHANNEL);
    subClient.removeListener('message', onMessage);
    bridgeStarted = false;
  };
}

/**
 * Replay notifications the client missed while disconnected.
 *
 * The `Last-Event-ID` header tells us the last event id the client processed;
 * we re-send every remembered event for the user (plus broadcasts) with a
 * later id. When no `lastEventId` is provided we replay nothing and let the
 * client receive only fresh events.
 */
export function replayMissedEvents(
  userId: string,
  lastEventId: string | null,
  res: Response,
): void {
  if (!lastEventId) {
    return;
  }

  const userEntries = recentByUser.get(userId) ?? [];
  const broadcastEntries = recentByUser.get('__broadcast__') ?? [];
  const all = [...broadcastEntries, ...userEntries].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  for (const entry of all) {
    // Notification ids are lexicographically sortable (`notif-<ts>-<n>`),
    // so string comparison is a correct "later than" test.
    if (entry.id > lastEventId) {
      writeEvent(res, entry);
    }
  }
}

/**
 * Write one SSE event with an `id:` line (required for Last-Event-ID
 * reconciliation) followed by `event:`/`data:` payload.
 */
function writeEvent(res: Response, entry: RecentNotification): void {
  res.write(`id: ${entry.id}\n`);
  res.write(`event: ${entry.event}\n`);
  res.write(`data: ${entry.data}\n\n`);
}

/** Exposed for tests. */
export function _clearRecentEvents(): void {
  recentByUser.clear();
}

/** Exposed for tests. */
export function _recentCount(userId: string | undefined): number {
  return (recentByUser.get(userId ?? '__broadcast__') ?? []).length;
}
