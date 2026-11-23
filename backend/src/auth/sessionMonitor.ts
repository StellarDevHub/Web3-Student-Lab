import { redisConnection as redis } from '../utils/redis.js';
import { revokeAllUserTokens } from './token.service.js';
import logger from '../utils/logger.js';

/**
 * Session Activity Monitor (#1116).
 *
 * Protects shared university lab terminals by tracking per-user session
 * activity and enforcing inactivity lockouts:
 *
 *  - `touchSession(userId)`   — called on mouse/keyboard/touch activity
 *  - `getSessionStatus`       — idle duration, locked state, thresholds
 *  - `lockSession`            — blur the UI immediately (manual or auto)
 *  - `unlockSession`          — re-authentication challenge gate
 *  - `purgeSession`           — extended idle (30m): revoke tokens, purge
 *    memory credentials, and terminate WebSocket channels
 *
 * State is stored in Redis with a TTL so stale entries expire naturally and
 * the monitor works across multiple backend instances. In test mode the
 * shared redis util returns an in-memory client, so this is fully unit
 * testable without a live Redis.
 */

export const SESSION_ACTIVITY_KEY = (userId: string): string =>
  `session:activity:${userId}`;
export const SESSION_LOCK_KEY = (userId: string): string =>
  `session:lock:${userId}`;

/** Default idle threshold before the UI locks (15 minutes). */
export const DEFAULT_IDLE_LOCK_MS = 15 * 60 * 1000;
/** Extended idle before credentials are purged and sessions revoked (30m). */
export const DEFAULT_EXTENDED_IDLE_MS = 30 * 60 * 1000;
/** Activity entries expire after 24h so stale keys never accumulate. */
const ACTIVITY_TTL_SECONDS = 24 * 60 * 60;

export interface SessionStatus {
  userId: string;
  locked: boolean;
  lastActivityAt: number;
  idleMs: number;
  idleLockThresholdMs: number;
  extendedIdleThresholdMs: number;
  /** True when the session is in the extended-idle purge window. */
  shouldPurge: boolean;
}

export interface SessionMonitorConfig {
  idleLockMs?: number;
  extendedIdleMs?: number;
}

const config: Required<SessionMonitorConfig> = {
  idleLockMs: DEFAULT_IDLE_LOCK_MS,
  extendedIdleMs: DEFAULT_EXTENDED_IDLE_MS,
};

/**
 * Override the inactivity thresholds (used by tests).
 */
export function configureSessionMonitor(
  next: SessionMonitorConfig,
): void {
  if (next.idleLockMs !== undefined) {
    config.idleLockMs = next.idleLockMs;
  }
  if (next.extendedIdleMs !== undefined) {
    config.extendedIdleMs = next.extendedIdleMs;
  }
}

/**
 * Record user activity (mouse / keyboard / touch). Resets the idle clock and
 * clears the automatic lock state so an active user is never blurred out.
 */
export async function touchSession(userId: string): Promise<void> {
  const now = Date.now();
  try {
    await redis.setex(SESSION_ACTIVITY_KEY(userId), ACTIVITY_TTL_SECONDS, String(now));
    // Re-activation clears the lock.
    await redis.del(SESSION_LOCK_KEY(userId));
  } catch (err) {
    logger.warn(`[session-monitor] Failed to record activity for ${userId}:`, err);
  }
}

/**
 * Read the current session status for a user.
 */
export async function getSessionStatus(
  userId: string,
  now: number = Date.now(),
): Promise<SessionStatus> {
  const [activityRaw, lockRaw] = await Promise.all([
    redis.get(SESSION_ACTIVITY_KEY(userId)),
    redis.get(SESSION_LOCK_KEY(userId)),
  ]);

  const lastActivityAt = activityRaw ? Number(activityRaw) : now;
  const idleMs = Math.max(0, now - lastActivityAt);
  const locked = lockRaw !== null;

  return {
    userId,
    locked,
    lastActivityAt,
    idleMs,
    idleLockThresholdMs: config.idleLockMs,
    extendedIdleThresholdMs: config.extendedIdleMs,
    shouldPurge: idleMs >= config.extendedIdleMs,
  };
}

/**
 * Lock a session immediately (manual lock or automatic idle trigger).
 * While locked, the frontend must blur sensitive views and require
 * re-authentication before the active session is usable again.
 */
export async function lockSession(userId: string): Promise<void> {
  try {
    await redis.setex(SESSION_LOCK_KEY(userId), ACTIVITY_TTL_SECONDS, String(Date.now()));
  } catch (err) {
    logger.warn(`[session-monitor] Failed to lock session for ${userId}:`, err);
  }
}

/**
 * Unlock a session after a successful re-authentication challenge
 * (biometric / PIN verified by the caller). Fails with `false` when the
 * session has already been purged by extended idle — the client must then do
 * a full login instead of resuming.
 */
export async function unlockSession(userId: string): Promise<boolean> {
  try {
    const status = await getSessionStatus(userId);
    if (status.shouldPurge) {
      return false;
    }
    await redis.del(SESSION_LOCK_KEY(userId));
    return true;
  } catch (err) {
    logger.warn(`[session-monitor] Failed to unlock session for ${userId}:`, err);
    return false;
  }
}

/**
 * Purge an extended-idle session: revoke all refresh tokens (invalidating the
 * session server-side), remove the activity/lock state, and terminate the
 * user's WebSocket channels (via the gateway hook, if registered).
 */
export async function purgeSession(userId: string): Promise<void> {
  logger.info(`[session-monitor] Purging extended-idle session for ${userId}`);
  try {
    await revokeAllUserTokens(userId);
  } catch (err) {
    logger.warn(`[session-monitor] Token revocation failed for ${userId}:`, err);
  }
  try {
    await redis.del(SESSION_ACTIVITY_KEY(userId), SESSION_LOCK_KEY(userId));
  } catch (err) {
    logger.warn(`[session-monitor] Failed to clear session state for ${userId}:`, err);
  }
  try {
    await terminateWebSocketChannels(userId);
  } catch (err) {
    logger.warn(`[session-monitor] Failed to terminate WebSocket channels for ${userId}:`, err);
  }
}

/**
 * Hook invoked by `purgeSession` to drop the user's WebSocket channels.
 * The gateway registers a callback at startup; when absent (e.g. unit tests,
 * or the gateway not initialized) this is a no-op.
 */
let terminateWebSocketChannels: (userId: string) => Promise<void> = async () => undefined;

/**
 * Register the WebSocket-termination callback (called by the gateway).
 */
export function registerWebSocketTerminator(
  fn: (userId: string) => Promise<void>,
): void {
  terminateWebSocketChannels = fn;
}
