/**
 * Distributed Queue Manager — BE-006
 *
 * Central registry for the BullMQ queues that carry background work, split by
 * criticality so a flood of low-value jobs can never starve the ones that
 * matter:
 *
 *   critical  → `tx-minting`           (Soroban certificate minting)
 *   standard  → `ipfs-pinning`         (IPFS pin requests)
 *             → `contract-evaluation`  (sandboxed WASM grading, BE-010)
 *   low       → `email-notifications`  (transactional email)
 *
 * Every job gets 1 initial attempt + `MAX_RETRIES` (5) retries with
 * exponential backoff and jitter. Once those are exhausted — or the processor
 * throws BullMQ's `UnrecoverableError` — the job is copied into the
 * dead-letter queue by `DlqProcessor`, which also raises alerts.
 *
 * Concurrency is enforced at two levels:
 *  - per worker process (`concurrency`) and, for queues that talk to rate
 *    limited upstreams such as Soroban RPC, a Redis-backed global `limiter`
 *    shared by every worker in the cluster;
 *  - per user at enqueue time, via a fixed-window counter in Redis, so one
 *    account cannot monopolise a queue.
 */

import { Queue, Worker, type Job, type JobsOptions, type Processor, type WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import logger from '../utils/logger.js';
import { DlqProcessor, DEAD_LETTER_QUEUE_NAME, type DeadLetterJobData } from '../workers/dlqProcessor.js';

export const QUEUE_NAMES = {
  TX_MINTING: 'tx-minting',
  IPFS_PINNING: 'ipfs-pinning',
  EMAIL_NOTIFICATIONS: 'email-notifications',
  CONTRACT_EVALUATION: 'contract-evaluation',
} as const;

export type ManagedQueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export type QueueTier = 'critical' | 'standard' | 'low';

/** Retries after the first attempt; BullMQ's `attempts` therefore is MAX_RETRIES + 1. */
export const MAX_RETRIES = 5;
export const BACKOFF_BASE_DELAY_MS = 2_000;
/** Fraction of each backoff delay that is randomised, to avoid thundering-herd retries. */
export const BACKOFF_JITTER = 0.5;

export interface QueueDefinition {
  name: ManagedQueueName;
  tier: QueueTier;
  /** Jobs processed in parallel by a single worker process. */
  concurrency: number;
  /** Cluster-wide throughput cap shared by all workers on this queue. */
  limiter?: { max: number; duration: number };
  /** Per-user enqueue quota. */
  userRateLimit: { max: number; windowMs: number };
}

const envInt = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function buildQueueDefinitions(): Record<ManagedQueueName, QueueDefinition> {
  return {
    [QUEUE_NAMES.TX_MINTING]: {
      name: QUEUE_NAMES.TX_MINTING,
      tier: 'critical',
      concurrency: envInt('MINTING_WORKER_CONCURRENCY', 2),
      // Soroban RPC rejects bursts of submissions; keep the whole cluster under it.
      limiter: { max: envInt('SOROBAN_RPC_MAX_SUBMISSIONS_PER_SEC', 5), duration: 1_000 },
      userRateLimit: { max: envInt('MINTING_USER_RATE_LIMIT_PER_MIN', 5), windowMs: 60_000 },
    },
    [QUEUE_NAMES.IPFS_PINNING]: {
      name: QUEUE_NAMES.IPFS_PINNING,
      tier: 'standard',
      concurrency: envInt('IPFS_WORKER_CONCURRENCY', 5),
      userRateLimit: { max: envInt('IPFS_USER_RATE_LIMIT_PER_MIN', 30), windowMs: 60_000 },
    },
    [QUEUE_NAMES.CONTRACT_EVALUATION]: {
      name: QUEUE_NAMES.CONTRACT_EVALUATION,
      tier: 'standard',
      concurrency: envInt('EVALUATION_WORKER_CONCURRENCY', 2),
      userRateLimit: { max: envInt('EVALUATION_USER_RATE_LIMIT_PER_MIN', 10), windowMs: 60_000 },
    },
    [QUEUE_NAMES.EMAIL_NOTIFICATIONS]: {
      name: QUEUE_NAMES.EMAIL_NOTIFICATIONS,
      tier: 'low',
      concurrency: envInt('EMAIL_WORKER_CONCURRENCY', 10),
      limiter: { max: envInt('EMAIL_MAX_SENDS_PER_SEC', 20), duration: 1_000 },
      userRateLimit: { max: envInt('EMAIL_USER_RATE_LIMIT_PER_MIN', 20), windowMs: 60_000 },
    },
  };
}

const TIER_PRIORITY: Record<QueueTier, number> = { critical: 1, standard: 5, low: 10 };

/** Default options applied to every job; callers may tighten but not disable retries. */
export function defaultJobOptions(tier: QueueTier, backoffDelayMs = BACKOFF_BASE_DELAY_MS): JobsOptions {
  return {
    attempts: MAX_RETRIES + 1,
    backoff: { type: 'exponential', delay: backoffDelayMs, jitter: BACKOFF_JITTER },
    priority: TIER_PRIORITY[tier],
    removeOnComplete: { age: 24 * 3600, count: 1_000 },
    // Keep terminal failures around for a week so they can be cross-checked
    // against the DLQ copy.
    removeOnFail: { age: 7 * 24 * 3600 },
  };
}

export class QueueRateLimitError extends Error {
  readonly statusCode = 429;
  constructor(
    readonly queueName: ManagedQueueName,
    readonly retryAfterMs: number
  ) {
    super(`Rate limit exceeded for queue '${queueName}'. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'QueueRateLimitError';
  }
}

export interface EnqueueOptions {
  /** Account the job is attributed to; drives the per-user quota. */
  userId?: string;
  /** Idempotency key; BullMQ ignores a second add with the same id. Must not contain ':'. */
  jobId?: string;
  delay?: number;
}

/** Minimal surface of the Redis client used for per-user quotas (lets tests pass ioredis-mock). */
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  quit?(): Promise<unknown>;
}

export interface QueueManagerOptions {
  connection?: { host: string; port: number; password?: string; username?: string; db?: number };
  rateLimitStore?: RateLimitStore;
  definitions?: Record<ManagedQueueName, QueueDefinition>;
  dlq?: DlqProcessor;
  /** Redis key prefix for every queue (BullMQ default: 'bull'). */
  prefix?: string;
  /** Base delay of the exponential retry backoff. */
  backoffDelayMs?: number;
  /** Injected for tests. */
  queueFactory?: (name: string) => Queue;
}

function connectionFromEnv(): NonNullable<QueueManagerOptions['connection']> {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) || 0 } : {}),
  };
}

export class QueueManager {
  readonly definitions: Record<ManagedQueueName, QueueDefinition>;
  private readonly connection: NonNullable<QueueManagerOptions['connection']>;
  private readonly prefix: string | undefined;
  private readonly backoffDelayMs: number;
  private readonly queueFactory: (name: string) => Queue;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private rateLimitStore: RateLimitStore | undefined;
  private dlqProcessor: DlqProcessor | undefined;

  constructor(options: QueueManagerOptions = {}) {
    this.definitions = options.definitions ?? buildQueueDefinitions();
    this.connection = options.connection ?? connectionFromEnv();
    this.rateLimitStore = options.rateLimitStore;
    this.dlqProcessor = options.dlq;
    this.prefix = options.prefix;
    this.backoffDelayMs = options.backoffDelayMs ?? BACKOFF_BASE_DELAY_MS;
    this.queueFactory =
      options.queueFactory ??
      ((name) =>
        new Queue(name, {
          connection: { ...this.connection, maxRetriesPerRequest: null },
          ...(this.prefix ? { prefix: this.prefix } : {}),
        }));
  }

  /** Lazily creates queues so importing this module never opens a Redis connection. */
  getQueue<T = unknown>(name: ManagedQueueName | typeof DEAD_LETTER_QUEUE_NAME): Queue<T> {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = this.queueFactory(name);
      this.queues.set(name, queue);
    }
    return queue as Queue<T>;
  }

  isManagedQueue(name: string): name is ManagedQueueName {
    return Object.prototype.hasOwnProperty.call(this.definitions, name);
  }

  get dlq(): DlqProcessor {
    if (!this.dlqProcessor) {
      this.dlqProcessor = new DlqProcessor({
        queue: this.getQueue<DeadLetterJobData>(DEAD_LETTER_QUEUE_NAME),
        resolveSourceQueue: (name) => (this.isManagedQueue(name) ? this.getQueue(name) : undefined),
      });
    }
    return this.dlqProcessor;
  }

  private getRateLimitStore(): RateLimitStore {
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Redis({ ...this.connection, maxRetriesPerRequest: 2, lazyConnect: true });
    }
    return this.rateLimitStore;
  }

  /**
   * Fixed-window per-user quota. Throws `QueueRateLimitError` once the user
   * exceeds `userRateLimit.max` jobs on this queue within the window.
   */
  async assertWithinUserRateLimit(name: ManagedQueueName, userId: string, now = Date.now()): Promise<void> {
    const { max, windowMs } = this.definitions[name].userRateLimit;
    const window = Math.floor(now / windowMs);
    const key = `queue-rl:${name}:${userId}:${window}`;
    const store = this.getRateLimitStore();
    const count = await store.incr(key);
    if (count === 1) await store.pexpire(key, windowMs);
    if (count > max) {
      throw new QueueRateLimitError(name, (window + 1) * windowMs - now);
    }
  }

  async enqueue<T extends object>(
    name: ManagedQueueName,
    jobName: string,
    data: T,
    options: EnqueueOptions = {}
  ): Promise<Job<T>> {
    const definition = this.definitions[name];
    if (options.userId) {
      await this.assertWithinUserRateLimit(name, options.userId);
    }

    const opts: JobsOptions = {
      ...defaultJobOptions(definition.tier, this.backoffDelayMs),
      ...(options.jobId ? { jobId: options.jobId } : {}),
      ...(options.delay ? { delay: options.delay } : {}),
    };
    const payload = options.userId ? { ...data, userId: options.userId } : data;
    return (this.getQueue<T>(name) as Queue).add(jobName, payload, opts) as Promise<Job<T>>;
  }

  /**
   * Starts a worker for `name` with the queue's concurrency/limiter settings
   * and wires terminal failures into the dead-letter queue.
   */
  createWorker<T = any, R = any>(
    name: ManagedQueueName,
    processor: Processor<T, R>,
    overrides: Partial<Pick<WorkerOptions, 'concurrency' | 'limiter'>> = {}
  ): Worker<T, R> {
    const definition = this.definitions[name];
    const worker = new Worker<T, R>(name, processor, {
      connection: { ...this.connection, maxRetriesPerRequest: null },
      ...(this.prefix ? { prefix: this.prefix } : {}),
      concurrency: overrides.concurrency ?? definition.concurrency,
      ...(overrides.limiter ?? definition.limiter ? { limiter: overrides.limiter ?? definition.limiter } : {}),
    });

    worker.on('failed', (job, err) => {
      if (!job) return;
      this.dlq.handleFailure(name, job as Job, err).catch((dlqErr: unknown) => {
        logger.error('[QueueManager] Failed to dead-letter job', {
          queue: name,
          jobId: job.id,
          error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
        });
      });
    });
    worker.on('error', (err) => {
      logger.error('[QueueManager] Worker error', { queue: name, error: err.message });
    });

    this.workers.push(worker as Worker);
    logger.info('[QueueManager] Worker started', {
      queue: name,
      tier: definition.tier,
      concurrency: overrides.concurrency ?? definition.concurrency,
    });
    return worker;
  }

  async getStats(): Promise<
    Array<{ queue: string; tier: QueueTier | 'dead-letter'; counts: Record<string, number> }>
  > {
    const states = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'] as const;
    const managed = await Promise.all(
      (Object.values(this.definitions) as QueueDefinition[]).map(async (def) => ({
        queue: def.name,
        tier: def.tier,
        counts: await this.getQueue(def.name).getJobCounts(...states),
      }))
    );
    const dlqCounts = await this.getQueue(DEAD_LETTER_QUEUE_NAME).getJobCounts('waiting', 'paused');
    return [...managed, { queue: DEAD_LETTER_QUEUE_NAME, tier: 'dead-letter', counts: dlqCounts }];
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    await this.rateLimitStore?.quit?.();
    this.workers.length = 0;
    this.queues.clear();
  }
}

let instance: QueueManager | null = null;

export function getQueueManager(): QueueManager {
  if (!instance) instance = new QueueManager();
  return instance;
}

/** Test hook: swap the process-wide manager. */
export function setQueueManager(manager: QueueManager | null): void {
  instance = manager;
}
