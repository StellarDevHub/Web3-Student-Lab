import logger from '../utils/logger.js';
import { getRedisClient } from '../utils/redis.js';

// Daily sponsorship limit in stroops per student DID (default 10 XLM = 100_000_000 stroops)
const DAILY_LIMIT_STROOPS = parseInt(process.env.RELAYER_DAILY_LIMIT_STROOPS || '100000000', 10);

function quotaKey(did: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `relayer:quota:${did}:${today}`;
}

/**
 * Returns seconds until midnight UTC — used as the Redis TTL so keys expire
 * naturally at the start of a new quota window.
 */
function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

/**
 * Check whether `feeStroops` fits within today's remaining quota for `did`.
 * Throws if the quota would be exceeded.
 */
export async function assertQuota(did: string, feeStroops: number): Promise<void> {
  const redis = getRedisClient();
  const key = quotaKey(did);

  let used = 0;
  try {
    const raw = await redis.get(key);
    used = raw ? parseInt(raw, 10) : 0;
  } catch (err) {
    // Redis unavailable — fail open with a warning so students aren't blocked
    // by infrastructure issues, but log it so ops can investigate.
    logger.warn(`Relayer quota Redis read failed for ${did}:`, err);
    return;
  }

  if (used + feeStroops > DAILY_LIMIT_STROOPS) {
    throw new Error(
      `Daily gas sponsorship limit reached for ${did}. Used: ${used}, limit: ${DAILY_LIMIT_STROOPS} stroops`
    );
  }
}

/**
 * Atomically increment the quota counter after a successful relay.
 */
export async function recordUsage(did: string, feeStroops: number): Promise<void> {
  const redis = getRedisClient();
  const key = quotaKey(did);

  try {
    const pipeline = redis.pipeline ? redis.pipeline() : null;
    if (pipeline) {
      pipeline.incrby(key, feeStroops);
      pipeline.expire(key, secondsUntilMidnightUTC());
      await pipeline.exec();
    } else {
      // fallback for test in-memory stub
      await redis.incrby(key, feeStroops);
    }
  } catch (err) {
    logger.warn(`Relayer quota Redis write failed for ${did}:`, err);
  }
}

/**
 * Returns today's used stroops for a student DID (useful for status endpoints).
 */
export async function getUsage(did: string): Promise<{ used: number; limit: number; remaining: number }> {
  const redis = getRedisClient();
  const key = quotaKey(did);
  let used = 0;

  try {
    const raw = await redis.get(key);
    used = raw ? parseInt(raw, 10) : 0;
  } catch {
    // ignore
  }

  return { used, limit: DAILY_LIMIT_STROOPS, remaining: Math.max(0, DAILY_LIMIT_STROOPS - used) };
}
