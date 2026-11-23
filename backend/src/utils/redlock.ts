/**
 * Backwards-compatible single-instance Redlock helpers (#1135).
 *
 * Delegates to the hardened implementation in `src/lib/lock` (#1419). New code
 * should import `lockManager` from `../lib/lock/index.js` directly so it can
 * opt into the quorum based {@link RedlockCoordinator}.
 *
 * Usage:
 *   import { withLock } from '../utils/redlock';
 *
 *   const result = await withLock(`compile:${contractId}`, 30_000, async () => {
 *     return await compileContract(contractId);
 *   });
 */

import { RedisLock } from '../lib/lock/RedisLock.js';
import type { LockRedisClient } from '../lib/lock/types.js';
import { redisConnection } from './redis.js';

const redisLock = new RedisLock(redisConnection as unknown as LockRedisClient);

/**
 * Execute a function while holding a distributed lock. Retries acquisition and
 * always releases the lock, extending it automatically for long operations.
 */
export function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  return redisLock.withLock(key, { ttlMs, autoExtend: true }, fn);
}

/** Check if a lock is currently held. */
export function isLocked(key: string): Promise<boolean> {
  return redisLock.isLocked(key);
}
