/**
 * Shared types for the distributed lock manager (#1419 / BE-HARD-28).
 */

/**
 * Minimal Redis surface required by the lock implementation. Satisfied by
 * ioredis, the {@link https://github.com/stipsan/ioredis-mock} test double and
 * the in-memory fallback shipped in `src/utils/redis.ts`.
 */
export interface LockRedisClient {
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<number>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  exists?(key: string): Promise<number>;
}

export interface LockOptions {
  /** Lock time-to-live in milliseconds. */
  ttlMs?: number;
  /** Number of retries after the first acquisition attempt. */
  retryCount?: number;
  /** Base delay between retries in milliseconds. */
  retryDelayMs?: number;
  /** Random jitter (0..retryJitterMs) added to each retry delay. */
  retryJitterMs?: number;
  /** Keep the lock alive during long-running work. */
  autoExtend?: boolean;
}

export interface LockHandle {
  /** Fully qualified Redis key (including the configured prefix). */
  readonly key: string;
  /** Random ownership token used for safe release/extension. */
  readonly value: string;
  readonly acquiredAt: number;
  readonly ttlMs: number;
  readonly expiresAt: number;
  release(): Promise<boolean>;
  extend(ttlMs?: number): Promise<boolean>;
  isExpired(now?: number): boolean;
}

export const DEFAULT_LOCK_TTL_MS = 30_000;
export const DEFAULT_RETRY_COUNT = 3;
export const DEFAULT_RETRY_DELAY_MS = 200;
export const DEFAULT_RETRY_JITTER_MS = 50;
export const LOCK_KEY_PREFIX = 'lock:';
