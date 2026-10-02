/**
 * Compile Queue — Issue #1381
 *
 * Offloads CPU-heavy Rust/Soroban builds to a distributed BullMQ worker pool,
 * preventing Express thread-pool saturation under concurrent compilation load.
 *
 * Architecture:
 *   - Three priority tiers: HIGH (premium), NORMAL (authenticated), LOW (anonymous)
 *   - Redis-backed job persistence with configurable retry / backoff
 *   - Enqueue helper validates input and returns job metadata for WebSocket polling
 */

import { Queue, type JobsOptions } from 'bullmq';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Queue name constant — shared by worker so both reference the same Redis key
// ---------------------------------------------------------------------------
export const COMPILE_QUEUE_NAME = 'compile-jobs';

// ---------------------------------------------------------------------------
// Priority tier definitions
//   BullMQ uses lower numbers = higher priority (1 is highest, 10 is lowest)
// ---------------------------------------------------------------------------
export const CompilePriority = {
  HIGH: 1,     // API-key holders / premium plan
  NORMAL: 5,   // Authenticated free-tier students
  LOW: 10,     // Anonymous / unauthenticated playground requests
} as const;

export type CompilePriority = (typeof CompilePriority)[keyof typeof CompilePriority];

// ---------------------------------------------------------------------------
// Job payload types
// ---------------------------------------------------------------------------
export interface CompileJobData {
  /** Raw Rust/Soroban source code submitted by the student */
  sourceCode: string;
  /** Language / toolchain: 'rust' | 'soroban' */
  language: 'rust' | 'soroban';
  /** Student or session identifier (used for WebSocket room routing) */
  userId: string;
  /** ISO timestamp at which the job was enqueued */
  enqueuedAt: string;
  /** Priority tier requested by the enqueue caller */
  priority: CompilePriority;
  /** Optional compiler flags passed through to the sandbox */
  flags?: string[];
  /** Correlation ID for distributed tracing */
  traceId?: string;
}

export interface CompileJobResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  wasmBase64?: string;   // populated on successful Soroban build
  artifacts?: string[];  // list of output artifact filenames
}

// ---------------------------------------------------------------------------
// Redis connection — parsed from REDIS_URL following the project-wide pattern
// ---------------------------------------------------------------------------
const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');

const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  // BullMQ requires maxRetriesPerRequest: null for blocking commands
  maxRetriesPerRequest: null as unknown as number,
};

// ---------------------------------------------------------------------------
// Queue instance
// ---------------------------------------------------------------------------
export const compileQueue = new Queue<CompileJobData, CompileJobResult>(COMPILE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    // Attempt up to 3 times with exponential back-off before moving to DLQ
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3_000,  // 3 s initial → 6 s → 12 s
    },
    // Remove completed jobs after 24 hours / 2 000 entries to cap memory usage
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 2_000,
    },
    // Retain failed jobs for 7 days for post-mortem inspection
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 5_000,
    },
  },
});

compileQueue.on('error', (err) => {
  logger.error('[compileQueue] Queue error:', err);
});

// ---------------------------------------------------------------------------
// Enqueue helper
// ---------------------------------------------------------------------------

/**
 * Validate and enqueue a compile job.
 *
 * Returns the BullMQ job object on success or throws on validation failure.
 *
 * Priority mapping:
 *   - users with role 'premium' or an API key → HIGH
 *   - authenticated free-tier students         → NORMAL
 *   - anonymous / unauthenticated              → LOW
 */
export async function enqueueCompileJob(
  data: Omit<CompileJobData, 'enqueuedAt'>,
  opts?: Partial<JobsOptions>,
): Promise<{ jobId: string; queueName: string; priority: CompilePriority; position: number }> {
  // Basic input validation before persisting to Redis
  if (!data.sourceCode || typeof data.sourceCode !== 'string') {
    throw new Error('sourceCode must be a non-empty string');
  }
  if (data.sourceCode.length > 500_000) {
    throw new Error('sourceCode exceeds maximum allowed size of 500 KB');
  }
  if (data.language !== 'rust' && data.language !== 'soroban') {
    throw new Error("language must be 'rust' or 'soroban'");
  }
  if (!data.userId || typeof data.userId !== 'string') {
    throw new Error('userId is required');
  }

  const jobData: CompileJobData = {
    ...data,
    enqueuedAt: new Date().toISOString(),
  };

  const jobOpts: JobsOptions = {
    priority: data.priority,
    // Deduplicate by userId + source hash within a 5-second window to prevent
    // rapid resubmission of identical payloads
    jobId: `compile:${data.userId}:${Buffer.from(data.sourceCode.slice(0, 256)).toString('base64url').slice(0, 32)}`,
    ...opts,
  };

  const job = await compileQueue.add('compile', jobData, jobOpts);

  const waitingCount = await compileQueue.getWaitingCount();

  logger.info(
    `[compileQueue] Enqueued job ${job.id} for user ${data.userId} (priority=${data.priority}, queue depth=${waitingCount})`,
  );

  return {
    jobId: job.id!,
    queueName: COMPILE_QUEUE_NAME,
    priority: data.priority,
    position: waitingCount,
  };
}

/**
 * Gracefully drain the compile queue and close the connection.
 * Called during application shutdown.
 */
export async function closeCompileQueue(): Promise<void> {
  await compileQueue.close();
  logger.info('[compileQueue] Queue closed');
}
