/**
 * JWT Session Blacklist & Instant Revocation Cache (#1137).
 *
 * Provides instant JWT revocation by storing revoked token JTIs in Redis
 * with TTL matching the token's remaining expiry. This enables:
 * - Logout: revoke the current session immediately
 * - Force logout all sessions: revoke all tokens for a user
 * - Admin revocation: revoke tokens for security incidents
 *
 * Usage:
 *   import { revokeToken, isTokenRevoked, revokeAllUserTokens } from '../utils/jwt-blacklist';
 *
 *   // On logout:
 *   await revokeToken(jti, expiresAt);
 *
 *   // On every authenticated request:
 *   if (await isTokenRevoked(jti)) throw new Error('Token revoked');
 *
 *   // Force logout all sessions:
 *   await revokeAllUserTokens(userId);
 */

import { redisConnection } from './redis';

const BLACKLIST_PREFIX = 'jwt:blacklist:';
const USER_SESSIONS_PREFIX = 'jwt:sessions:';

/**
 * Calculate TTL in seconds from now until the expiry date.
 * Returns at least 1 second to ensure the key exists.
 */
function ttlUntil(expiresAt: Date): number {
  const now = Date.now();
  const expiry = expiresAt.getTime();
  const ttlSeconds = Math.max(1, Math.ceil((expiry - now) / 1000));
  return ttlSeconds;
}

/**
 * Revoke a single JWT by its JTI (JWT ID).
 *
 * @param jti        The JWT's unique ID claim
 * @param expiresAt  When the token naturally expires (used as Redis TTL)
 * @param userId     Optional user ID to track in the user's session set
 */
export async function revokeToken(
  jti: string,
  expiresAt: Date,
  userId?: string,
): Promise<void> {
  const ttl = ttlUntil(expiresAt);

  // Add to blacklist with auto-expiry
  await redisConnection.setex(`${BLACKLIST_PREFIX}${jti}`, ttl, '1');

  // Track in user's active sessions for bulk revocation
  if (userId) {
    await redisConnection.sadd(`${USER_SESSIONS_PREFIX}${userId}`, jti);
    // Set TTL on the sessions set too (clean up after all tokens expire)
    await redisConnection.expire(`${USER_SESSIONS_PREFIX}${userId}`, ttl);
  }
}

/**
 * Check if a JWT has been revoked.
 *
 * @param jti  The JWT's unique ID claim
 * @returns    true if the token has been revoked
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  const result = await redisConnection.exists(`${BLACKLIST_PREFIX}${jti}`);
  return result === 1;
}

/**
 * Revoke ALL active sessions for a user (force logout everywhere).
 *
 * @param userId  The user whose sessions to revoke
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const sessionKey = `${USER_SESSIONS_PREFIX}${userId}`;

  // Get all tracked JTIs for this user
  const jtis = await redisConnection.smembers(sessionKey);

  if (jtis.length === 0) return 0;

  // Revoke each token (with a generous TTL fallback of 24h)
  const fallbackTtl = 86400;
  const pipeline = redisConnection.pipeline?.() ?? redisConnection;

  for (const jti of jtis) {
    pipeline.setex(`${BLACKLIST_PREFIX}${jti}`, fallbackTtl, '1');
  }

  // Clean up the sessions set
  pipeline.del(sessionKey);

  await pipeline.exec?.();
  return jtis.length;
}

/**
 * Get the count of active (non-revoked) sessions for a user.
 * Useful for "logged in devices" UI.
 */
export async function getActiveSessionCount(userId: string): Promise<number> {
  const jtis = await redisConnection.smembers(`${USER_SESSIONS_PREFIX}${userId}`);
  if (jtis.length === 0) return 0;

  // Check which are still valid (not revoked)
  let activeCount = 0;
  for (const jti of jtis) {
    const revoked = await isTokenRevoked(jti);
    if (!revoked) activeCount++;
  }
  return activeCount;
}
