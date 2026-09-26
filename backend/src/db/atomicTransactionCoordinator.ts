/**
 * Atomic Transaction Coordinator (#1419 / BE-HARD-28).
 *
 * Ties a distributed lock to a Prisma interactive transaction so that a
 * critical section (e.g. compiling a project or reconciling a schema change)
 * is both mutually exclusive across backend nodes and atomic with respect to
 * the database. Retries transient serialization/deadlock conflicts with
 * exponential-ish backoff while the lock remains held.
 */

import logger from '../utils/logger.js';
import {
  lockManager,
  type DistributedLockManager,
  type LockOptions,
} from '../lib/lock/index.js';

export type TransactionClient = Record<string, any>;
export type TransactionRunner = <T>(work: (tx: TransactionClient) => Promise<T>) => Promise<T>;

export interface AtomicTransactionCoordinatorOptions {
  lockManager?: DistributedLockManager;
  /** Override the transaction runner (used in tests). */
  runner?: TransactionRunner;
  maxRetries?: number;
  retryDelayMs?: number;
  defaultLockTtlMs?: number;
}

export interface CoordinatedRunOptions extends LockOptions {
  /** Explicit lock resource. `null` skips locking. */
  lockResource?: string | null;
  maxRetries?: number;
  retryDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 50;
const DEFAULT_LOCK_TTL_MS = 30_000;

const RETRYABLE_PATTERNS: RegExp[] = [
  /deadlock/i,
  /serializ/i,
  /write conflict/i,
  /could not serialize/i,
  /SQLITE_BUSY/i,
  /P2034/,
  /\b40001\b/,
];

export function isRetryableTransactionError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(message));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AtomicTransactionCoordinator {
  private readonly locks: DistributedLockManager;
  private readonly runner?: TransactionRunner;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly defaultLockTtlMs: number;

  constructor(options: AtomicTransactionCoordinatorOptions = {}) {
    this.locks = options.lockManager ?? lockManager;
    this.runner = options.runner;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.defaultLockTtlMs = options.defaultLockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  }

  /**
   * Run `work` inside a database transaction while holding the distributed
   * lock identified by `lockResource`.
   */
  async run<T>(
    lockResource: string | null,
    work: (tx: TransactionClient) => Promise<T>,
    options: CoordinatedRunOptions = {},
  ): Promise<T> {
    const execute = () => this.executeWithRetries(work, options);
    const resource = options.lockResource === undefined ? lockResource : options.lockResource;

    if (!resource) {
      return execute();
    }

    return this.locks.withLock(
      resource,
      { ttlMs: this.defaultLockTtlMs, retryCount: 3, ...options },
      execute,
    );
  }

  /**
   * Run arbitrary (non-transactional) work under a distributed lock. Useful
   * for DDL migrations which cannot run inside a Prisma transaction.
   */
  async runExclusive<T>(lockResource: string, work: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    return this.locks.withLock(
      lockResource,
      { ttlMs: this.defaultLockTtlMs, retryCount: 3, ...options },
      work,
    );
  }

  private async executeWithRetries<T>(
    work: (tx: TransactionClient) => Promise<T>,
    options: CoordinatedRunOptions,
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const retryDelayMs = options.retryDelayMs ?? this.retryDelayMs;

    let attempt = 0;
    for (;;) {
      try {
        return await this.runTransaction(work);
      } catch (error) {
        if (attempt >= maxRetries || !isRetryableTransactionError(error)) {
          if (attempt > 0) {
            logger.error('AtomicTransactionCoordinator: transaction failed after retries', error);
          }
          throw error;
        }
        attempt += 1;
        logger.warn(`AtomicTransactionCoordinator: retrying transaction (attempt ${attempt})`, {
          error: String(error),
        });
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  private async runTransaction<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
    if (this.runner) {
      return this.runner(work);
    }

    // Lazy import so importing this module never opens a database pool.
    const mod = await import('./index.js');
    const prisma = ((mod as { default?: unknown }).default ?? (mod as { prisma?: unknown }).prisma) as {
      $transaction: (fn: (tx: TransactionClient) => Promise<T>) => Promise<T>;
    } | undefined;

    if (!prisma || typeof prisma.$transaction !== 'function') {
      throw new Error('AtomicTransactionCoordinator: Prisma client is unavailable');
    }

    return prisma.$transaction(work);
  }
}

export const atomicTransactionCoordinator = new AtomicTransactionCoordinator();
