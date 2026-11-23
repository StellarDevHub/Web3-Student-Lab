/**
 * Multi-instance Redlock coordinator (#1419 / BE-HARD-28).
 *
 * Guarantees mutual exclusion across independent Redis instances (or an
 * odd-sized set of primaries in a cluster) by requiring a majority quorum of
 * successful acquisitions within a bounded time budget. The remaining
 * validity is reduced by the measured acquisition time and a clock-drift
 * allowance, matching the canonical Redlock algorithm.
 */

import { RedisLock, LockAcquisitionError } from './RedisLock.js';
import {
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RETRY_JITTER_MS,
  type LockHandle,
  type LockOptions,
  type LockRedisClient,
} from './types.js';

const DEFAULT_CLOCK_DRIFT_FACTOR = 0.01;

export interface RedlockCoordinatorOptions {
  keyPrefix?: string;
  /** Fraction of the TTL reserved for clock drift / network latency. */
  clockDriftFactor?: number;
  /** Override the default majority quorum (`floor(n / 2) + 1`). */
  quorum?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomJitter(max: number): number {
  return max > 0 ? Math.floor(Math.random() * max) : 0;
}

export class RedlockCoordinator {
  private readonly locks: RedisLock[];
  private readonly clockDriftFactor: number;
  private readonly customQuorum?: number;

  constructor(clients: LockRedisClient[], options: RedlockCoordinatorOptions = {}) {
    if (clients.length === 0) {
      throw new Error('RedlockCoordinator requires at least one Redis client');
    }
    this.locks = clients.map((client) => new RedisLock(client, options.keyPrefix));
    this.clockDriftFactor = options.clockDriftFactor ?? DEFAULT_CLOCK_DRIFT_FACTOR;
    this.customQuorum = options.quorum;
  }

  get size(): number {
    return this.locks.length;
  }

  get quorum(): number {
    return this.customQuorum ?? Math.floor(this.locks.length / 2) + 1;
  }

  /**
   * Attempt to acquire the lock on a majority of instances. On failure every
   * partial acquisition is released so no instance is left holding a orphan.
   */
  async acquire(key: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): Promise<LockHandle | null> {
    const start = Date.now();
    const granted: LockHandle[] = [];
    for (const lock of this.locks) {
      const handle = await lock.tryAcquire(key, ttlMs);
      if (handle) {
        granted.push(handle);
      }
    }

    const elapsed = Date.now() - start;
    const drift = Math.floor(ttlMs * this.clockDriftFactor) + 2;
    const validityMs = ttlMs - elapsed - drift;

    if (granted.length >= this.quorum && validityMs > 0) {
      return this.createHandle(key, granted, validityMs);
    }

    await Promise.all(granted.map((handle) => handle.release()));
    return null;
  }

  /**
   * Acquire with retries, execute `fn`, and always release on every instance.
   */
  async withLock<T>(key: string, options: LockOptions, fn: () => Promise<T>): Promise<T> {
    const ttlMs = options.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const retryJitterMs = options.retryJitterMs ?? DEFAULT_RETRY_JITTER_MS;

    let handle: LockHandle | null = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      handle = await this.acquire(key, ttlMs);
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
    if ((options.autoExtend ?? true) && ttlMs > 0) {
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

  private createHandle(key: string, granted: LockHandle[], validityMs: number): LockHandle {
    const acquiredAt = Date.now();
    const expiresAt = acquiredAt + validityMs;
    return {
      key,
      value: granted[0]?.value ?? '',
      acquiredAt,
      ttlMs: validityMs,
      expiresAt,
      isExpired: (now: number = Date.now()) => now >= expiresAt,
      release: async () => {
        const results = await Promise.all(granted.map((handle) => handle.release()));
        return results.some(Boolean);
      },
      extend: async (nextTtlMs: number = validityMs) => {
        const results = await Promise.all(granted.map((handle) => handle.extend(nextTtlMs)));
        return results.filter(Boolean).length >= this.quorum;
      },
    };
  }
}
