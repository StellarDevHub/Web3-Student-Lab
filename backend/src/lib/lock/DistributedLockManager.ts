/**
 * Distributed lock manager facade (#1419 / BE-HARD-28).
 *
 * A single entry point used by the compilation pipeline and the database
 * migration tooling. It selects a single-instance {@link RedisLock} when one
 * Redis endpoint is configured, or a quorum based {@link RedlockCoordinator}
 * when several independent endpoints are supplied.
 */

import { redisConnection } from '../../utils/redis.js';
import { RedisLock } from './RedisLock.js';
import { RedlockCoordinator } from './RedlockCoordinator.js';
import { DEFAULT_LOCK_TTL_MS, type LockHandle, type LockOptions, type LockRedisClient } from './types.js';

export const COMPILE_LOCK_NAMESPACE = 'compile';
export const MIGRATION_LOCK_KEY = 'migration:schema';
export const DEFAULT_MIGRATION_LOCK_TTL_MS = 10 * 60_000;

export interface DistributedLockManagerOptions {
  /** Single Redis client (used for a single-instance lock). */
  client?: LockRedisClient;
  /** Multiple independent Redis clients (enables quorum based Redlock). */
  clients?: LockRedisClient[];
  keyPrefix?: string;
  defaults?: LockOptions;
  clockDriftFactor?: number;
}

/** Deterministic, namespaced key that uniquely identifies a project compile. */
export function compileLockKey(projectId: string): string {
  return `${COMPILE_LOCK_NAMESPACE}:${projectId}`;
}

export class DistributedLockManager {
  private readonly primary: RedisLock;
  private readonly redlock: RedlockCoordinator | null;
  private readonly defaults: LockOptions;

  constructor(options: DistributedLockManagerOptions = {}) {
    const clients: LockRedisClient[] = options.clients?.length
      ? options.clients
      : [options.client ?? (redisConnection as unknown as LockRedisClient)];

    const first = clients[0];
    if (!first) {
      throw new Error('DistributedLockManager requires at least one Redis client');
    }

    this.primary = new RedisLock(first, options.keyPrefix);
    this.redlock =
      clients.length > 1
        ? new RedlockCoordinator(clients, {
            keyPrefix: options.keyPrefix,
            clockDriftFactor: options.clockDriftFactor,
          })
        : null;
    this.defaults = options.defaults ?? {};
  }

  /** Effective quorum for the configured instances (1 for single-instance). */
  get quorum(): number {
    return this.redlock?.quorum ?? 1;
  }

  compileLockKey(projectId: string): string {
    return compileLockKey(projectId);
  }

  migrationLockKey(): string {
    return MIGRATION_LOCK_KEY;
  }

  /** Non-blocking acquisition of a single lock handle. */
  async acquire(key: string, ttlMs: number = this.defaults.ttlMs ?? DEFAULT_LOCK_TTL_MS): Promise<LockHandle | null> {
    if (this.redlock) {
      return this.redlock.acquire(key, ttlMs);
    }
    return this.primary.tryAcquire(key, ttlMs);
  }

  async withLock<T>(key: string, options: LockOptions, fn: () => Promise<T>): Promise<T> {
    const merged: LockOptions = { ...this.defaults, ...options };
    if (this.redlock) {
      return this.redlock.withLock(key, merged, fn);
    }
    return this.primary.withLock(key, merged, fn);
  }

  /** Mutual exclusion for compiling a single project. */
  async withCompileLock<T>(projectId: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    return this.withLock(this.compileLockKey(projectId), options, fn);
  }

  /** Global mutual exclusion for database schema migrations. */
  async withMigrationLock<T>(fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    return this.withLock(
      MIGRATION_LOCK_KEY,
      { ttlMs: DEFAULT_MIGRATION_LOCK_TTL_MS, autoExtend: true, ...options },
      fn,
    );
  }

  async isLocked(key: string): Promise<boolean> {
    return this.primary.isLocked(key);
  }
}

export const lockManager = new DistributedLockManager();
