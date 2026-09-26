/**
 * Single-instance Redis lock (#1419 / BE-HARD-28).
 *
 * Implements the "simple SET NX lock" and "lock expiration TTL handler"
 * sub-tasks: atomic acquisition with `SET key value PX ttl NX`, token-based
 * ownership, safe release/extension through Lua compare-and-delete /
 * compare-and-expire scripts, retry with jitter and optional auto-extension.
 */

import { randomUUID } from 'crypto';
import logger from '../../utils/logger.js';
import {
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RETRY_JITTER_MS,
  LOCK_KEY_PREFIX,
  type LockHandle,
  type LockOptions,
  type LockRedisClient,
} from './types.js';

/** Atomic check-and-delete — only the owner can release the lock. */
export const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/** Atomic check-and-expire — only the owner can extend the lock TTL. */
export const EXTEND_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export class LockAcquisitionError extends Error {
  readonly code = 'LOCK_ACQUISITION_FAILED';
  readonly lockKey: string;
  readonly attempts: number;

  constructor(lockKey: string, attempts: number) {
    super(`Failed to acquire distributed lock "${lockKey}" after ${attempts} attempt(s)`);
    this.name = 'LockAcquisitionError';
    this.lockKey = lockKey;
    this.attempts = attempts;
  }
}

function generateLockToken(): string {
  return `${process.pid}-${Date.now()}-${randomUUID()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomJitter(max: number): number {
  return max > 0 ? Math.floor(Math.random() * max) : 0;
}

export class RedisLock {
  constructor(
    private readonly client: LockRedisClient,
    private readonly keyPrefix: string = LOCK_KEY_PREFIX,
  ) {}

  private fullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Attempt a single non-blocking acquisition. Returns a handle when the lock
   * was granted, `null` when it is already held by someone else.
   */
  async tryAcquire(key: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): Promise<LockHandle | null> {
    const fullKey = this.fullKey(key);
    const value = generateLockToken();
    try {
      const result = await this.client.set(fullKey, value, 'PX', ttlMs, 'NX');
      if (result !== 'OK') {
        return null;
      }
      return this.createHandle(fullKey, value, ttlMs);
    } catch (error) {
      logger.warn(`RedisLock: failed to acquire lock "${key}"`, error);
      return null;
    }
  }

  /** Release the lock only if the supplied token still owns it. */
  async release(fullKey: string, value: string): Promise<boolean> {
    try {
      const result = await this.client.eval(RELEASE_LOCK_SCRIPT, 1, fullKey, value);
      return Number(result) === 1;
    } catch (error) {
      logger.warn(`RedisLock: failed to release lock "${fullKey}"`, error);
      return false;
    }
  }

  /** Extend the lock TTL only if the supplied token still owns it. */
  async extend(fullKey: string, value: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): Promise<boolean> {
    try {
      const result = await this.client.eval(EXTEND_LOCK_SCRIPT, 1, fullKey, value, ttlMs);
      return Number(result) === 1;
    } catch (error) {
      logger.warn(`RedisLock: failed to extend lock "${fullKey}"`, error);
      return false;
    }
  }

  async isLocked(key: string): Promise<boolean> {
    const fullKey = this.fullKey(key);
    try {
      if (typeof this.client.exists === 'function') {
        return Number(await this.client.exists(fullKey)) === 1;
      }
      return (await this.client.get(fullKey)) !== null;
    } catch (error) {
      logger.warn(`RedisLock: failed to check lock "${key}"`, error);
      return false;
    }
  }

  /**
   * Acquire a lock with retries, run `fn`, then always release. Throws
   * {@link LockAcquisitionError} when the lock cannot be obtained.
   */
  async withLock<T>(key: string, options: LockOptions, fn: () => Promise<T>): Promise<T> {
    const ttlMs = options.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const retryJitterMs = options.retryJitterMs ?? DEFAULT_RETRY_JITTER_MS;
    const autoExtend = options.autoExtend ?? true;

    let handle: LockHandle | null = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      handle = await this.tryAcquire(key, ttlMs);
      if (handle) {
        break;
      }
      if (attempt < retryCount) {
        await sleep(retryDelayMs + randomJitter(retryJitterMs));
      }
    }

    const acquired = handle;
    if (!acquired) {
      throw new LockAcquisitionError(key, retryCount + 1);
    }

    let timer: NodeJS.Timeout | null = null;
    if (autoExtend && ttlMs > 0) {
      timer = setInterval(() => {
        void acquired.extend(ttlMs);
      }, Math.max(1_000, Math.floor(ttlMs / 3)));
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    }

    try {
      return await fn();
    } finally {
      if (timer) {
        clearInterval(timer);
      }
      await acquired.release();
    }
  }

  private createHandle(fullKey: string, value: string, ttlMs: number): LockHandle {
    const acquiredAt = Date.now();
    const expiresAt = acquiredAt + ttlMs;
    return {
      key: fullKey,
      value,
      acquiredAt,
      ttlMs,
      expiresAt,
      isExpired: (now: number = Date.now()) => now >= expiresAt,
      release: () => this.release(fullKey, value),
      extend: (nextTtlMs: number = ttlMs) => this.extend(fullKey, value, nextTtlMs),
    };
  }
}
