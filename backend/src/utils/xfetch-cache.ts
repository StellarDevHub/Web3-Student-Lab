/**
 * Cache Stampede Mitigation Using Probabilistic Early Expiration (XFetch) (#1138).
 *
 * When a popular cache key expires, many concurrent requests can simultaneously
 * miss the cache and all try to regenerate the value — a "cache stampede" or
 * "thundering herd". XFetch uses probabilistic early expiration to spread
 * regeneration requests over time, preventing stampedes.
 *
 * The algorithm: before the TTL naturally expires, a random probability check
 * triggers early refresh. The probability increases as the key approaches
 * expiry, so regeneration is spread evenly rather than all at once.
 *
 * Usage:
 *   import { xfetch } from '../utils/xfetch-cache';
 *
 *   const data = await xfetch('course:123', 60, async () => {
 *     return await fetchCourseFromDB(123);
 *   });
 */

import { redisConnection } from './redis';

const CACHE_PREFIX = 'cache:';
const LOCK_PREFIX = 'xfetch:lock:';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface XFetchOptions {
  /** Base TTL in seconds. Default: 60. */
  ttl?: number;
  /** Beta parameter for XFetch algorithm. Higher = more aggressive early refresh. Default: 1. */
  beta?: number;
  /** Lock timeout in ms to prevent concurrent regeneration. Default: 5000. */
  lockTimeoutMs?: number;
}

/**
 * Probabilistic early expiration check (XFetch algorithm).
 *
 * Returns true if this request should regenerate the cache value early.
 * The probability increases as the key approaches natural expiry.
 *
 * @param ttl        Original TTL in seconds
 * @param expiresAt  When the cached value expires (epoch ms)
 * @param beta       Aggressiveness parameter (default 1)
 */
function shouldRefresh(ttl: number, expiresAt: number, beta: number = 1): boolean {
  const now = Date.now() / 1000;
  const remainingTtl = expiresAt / 1000 - now;
  const delta = ttl - remainingTtl;

  // XFetch formula: P(refresh) = beta * delta / ttl
  // When delta approaches ttl (key near expiry), probability approaches beta
  const probability = (beta * delta) / ttl;

  return Math.random() < probability;
}

/**
 * Acquire a regeneration lock to prevent concurrent rebuilds.
 */
async function acquireRegenLock(key: string, timeoutMs: number): Promise<boolean> {
  const lockKey = `${LOCK_PREFIX}${key}`;
  const result = await redisConnection.set(lockKey, '1', 'PX', timeoutMs, 'NX');
  return result === 'OK';
}

/**
 * Release a regeneration lock.
 */
async function releaseRegenLock(key: string): Promise<void> {
  await redisConnection.del(`${LOCK_PREFIX}${key}`);
}

/**
 * Fetch a value from cache, regenerating it probabilistically before expiry.
 *
 * @param key       Cache key
 * @param ttl       TTL in seconds for the cached value
 * @param generator Async function to generate the value on cache miss/refresh
 * @param options   XFetch configuration options
 * @returns         The cached or freshly generated value
 */
export async function xfetch<T>(
  key: string,
  ttl: number,
  generator: () => Promise<T>,
  options: XFetchOptions = {},
): Promise<T> {
  const { beta = 1, lockTimeoutMs = 5000 } = options;
  const cacheKey = `${CACHE_PREFIX}${key}`;

  // Try to read from cache
  try {
    const raw = await redisConnection.get(cacheKey);
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);

      // Check if we should do probabilistic early refresh
      if (shouldRefresh(ttl, entry.expiresAt, beta)) {
        // Try to acquire lock for regeneration (non-blocking)
        const lockAcquired = await acquireRegenLock(key, lockTimeoutMs);
        if (lockAcquired) {
          try {
            // Regenerate in background (don't await — return stale value)
            generator().then(async (freshValue) => {
              const newEntry: CacheEntry<T> = {
                value: freshValue,
                expiresAt: Date.now() + ttl * 1000,
              };
              await redisConnection.setex(cacheKey, ttl, JSON.stringify(newEntry));
              await releaseRegenLock(key);
            }).catch(() => releaseRegenLock(key));
          } catch {
            await releaseRegenLock(key);
          }
        }
      }

      return entry.value;
    }
  } catch {
    // Cache read failed — fall through to regeneration
  }

  // Cache miss or parse error — regenerate
  const lockAcquired = await acquireRegenLock(key, lockTimeoutMs);
  if (!lockAcquired) {
    // Another process is regenerating — wait and retry
    await new Promise((resolve) => setTimeout(resolve, 200));
    const retryRaw = await redisConnection.get(cacheKey);
    if (retryRaw) {
      const retryEntry: CacheEntry<T> = JSON.parse(retryRaw);
      return retryEntry.value;
    }
  }

  try {
    const value = await generator();
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttl * 1000,
    };
    await redisConnection.setex(cacheKey, ttl, JSON.stringify(entry));
    return value;
  } finally {
    if (lockAcquired) {
      await releaseRegenLock(key);
    }
  }
}

/**
 * Invalidate a cached key.
 */
export async function xinvalidate(key: string): Promise<void> {
  await redisConnection.del(`${CACHE_PREFIX}${key}`);
  await redisConnection.del(`${LOCK_PREFIX}${key}`);
}
