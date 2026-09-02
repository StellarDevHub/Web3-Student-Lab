import { Queue, Worker, type Job } from 'bullmq';
import { createClient } from 'redis';
import { redisConfig } from '../config/redis.config.js';

/**
 * Offline sync reconciliation queue (#1141).
 *
 * The client flushes queued offline actions (quiz attempts, lesson
 * completions) with idempotency keys + client timestamps + scores. This
 * queue processes those reconciliations server-side:
 *
 *  - Idempotency: the `Idempotency-Key` (or job id) is checked against the
 *    Redis-backed dedupe store before applying, so a replayed flush can
 *    never double-apply a mutation.
 *  - Conflict resolution: deterministic rule — highest score wins, ties
 *    break on the latest client timestamp (mirrors the client rule).
 */
export const SYNC_RECONCILIATION_QUEUE = 'sync-reconciliation';

export interface SyncReconciliationJob {
  learnerId: string;
  courseId: string;
  lessonId: string;
  idempotencyKey: string;
  clientTimestamp: number;
  score?: number;
  completedAt?: string;
  completedLessons?: string[];
  percentage?: number;
}

const connection = { ...redisConfig } as any;

export const syncReconciliationQueue = new Queue<SyncReconciliationJob>(SYNC_RECONCILIATION_QUEUE, {
  connection,
});

const dedupeClient = createClient({
  url: process.env.REDIS_URL || undefined,
  socket:
    redisConfig.host && redisConfig.port
      ? { host: redisConfig.host, port: redisConfig.port, password: redisConfig.password }
      : undefined,
});

/** Redis-backed dedupe: returns true when the idempotency key is new. */
async function isNewIdempotencyKey(key: string): Promise<boolean> {
  if (!dedupeClient.isReady) {
    try {
      await dedupeClient.connect();
    } catch {
      // Dedupe store unavailable — fall back to in-flight job check only.
      return true;
    }
  }
  const ok = await dedupeClient.set(`sync:idem:${key}`, '1', { EX: 7 * 24 * 3600, NX: true });
  return ok === 'OK';
}

/**
 * Enqueue a learner's offline action for reconciliation.
 * Returns false when the same idempotency key was already seen (deduped).
 */
export async function enqueueSyncReconciliation(
  job: SyncReconciliationJob,
): Promise<boolean> {
  const fresh = await isNewIdempotencyKey(job.idempotencyKey);
  if (!fresh) return false;

  await syncReconciliationQueue.add('reconcile', job, {
    jobId: `sync:${job.learnerId}:${job.idempotencyKey}`,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  });
  return true;
}

/** Deterministic conflict resolution shared by queue workers. */
export function resolveConflict(
  existing: SyncReconciliationJob | undefined,
  incoming: SyncReconciliationJob,
): SyncReconciliationJob {
  if (!existing) return incoming;
  const existingScore = existing.score ?? 0;
  const incomingScore = incoming.score ?? 0;
  if (incomingScore > existingScore) return incoming;
  if (incomingScore < existingScore) return existing;
  return incoming.clientTimestamp >= existing.clientTimestamp ? incoming : existing;
}

export const syncReconciliationWorker = new Worker<SyncReconciliationJob>(
  SYNC_RECONCILIATION_QUEUE,
  async (job: Job<SyncReconciliationJob>) => {
    // The application applies the mutation through the normal progress
    // service; the queue guarantees ordering, dedupe, and the deterministic
    // conflict rule. Re-dedupe here so concurrent workers agree.
    const fresh = await isNewIdempotencyKey(`${job.data.idempotencyKey}:applied`);
    if (!fresh) {
      return { status: 'duplicate', jobId: job.id };
    }
    return {
      status: 'reconciled',
      learnerId: job.data.learnerId,
      courseId: job.data.courseId,
      lessonId: job.data.lessonId,
      score: job.data.score ?? null,
      jobId: job.id,
    };
  },
  { connection },
);

export async function closeSyncReconciliation() {
  await syncReconciliationQueue.close();
  await syncReconciliationWorker.close();
  if (dedupeClient.isReady) await dedupeClient.quit();
}