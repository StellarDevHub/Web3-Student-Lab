import crypto from 'crypto';
import logger from '../utils/logger.js';
import { webhookDeliveryQueue, WEBHOOK_DELIVERY_QUEUE_NAME } from './webhooks/queue.js';
import { exportQueue, EXPORT_QUEUE_NAME } from '../jobs/export.queue.js';
import { backupQueue, BACKUP_QUEUE_NAME } from '../jobs/backup.queue.js';
import { storagePinQueue, STORAGE_PIN_QUEUE_NAME } from './storage/queue.js';

export interface DLQJobRecord {
  dlqId: string;
  originalQueue: string;
  jobName: string;
  data: Record<string, any>;
  opts?: Record<string, any>;
  failedAt: string;
  error: string;
  traceId: string;
  attemptsMade: number;
}

// In-memory store for DLQ records, providing fast inspection, replay, and purge.
const dlqStore = new Map<string, DLQJobRecord>();

export const DEFAULT_DLQ_ALERT_THRESHOLD = 10;

/**
 * Calculates exponential backoff delay with random jitter.
 */
export function calculateExponentialBackoffWithJitter(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000,
  jitterFraction = 0.2
): number {
  const safeAttempt = Math.max(1, attempt);
  const delay = Math.min(maxDelay, baseDelay * Math.pow(2, safeAttempt - 1));
  const jitter = Math.random() * delay * jitterFraction;
  return Math.floor(delay + jitter);
}

/**
 * Calculates linear backoff delay with random jitter.
 */
export function calculateLinearBackoffWithJitter(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000,
  jitterFraction = 0.2
): number {
  const safeAttempt = Math.max(1, attempt);
  const delay = Math.min(maxDelay, baseDelay * safeAttempt);
  const jitter = Math.random() * delay * jitterFraction;
  return Math.floor(delay + jitter);
}

/**
 * Enqueues a failed job record to the Dead Letter Queue.
 */
export async function enqueueToDLQ(
  input: Omit<DLQJobRecord, 'dlqId' | 'failedAt'>
): Promise<DLQJobRecord> {
  const dlqId = `dlq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const traceId =
    input.traceId ||
    input.data?.traceId ||
    input.data?.event?.id ||
    input.data?.deliveryId ||
    `trace_${crypto.randomBytes(6).toString('hex')}`;

  const record: DLQJobRecord = {
    dlqId,
    originalQueue: input.originalQueue,
    jobName: input.jobName,
    data: {
      ...input.data,
      traceId,
    },
    opts: input.opts,
    failedAt: new Date().toISOString(),
    error: input.error,
    traceId,
    attemptsMade: input.attemptsMade,
  };

  dlqStore.set(dlqId, record);
  logger.warn(
    `Job [${input.jobName}] from queue [${input.originalQueue}] sent to DLQ (ID: ${dlqId}, traceId: ${traceId}). Error: ${input.error}`
  );

  await checkDLQMetricsAlert();

  return record;
}

/**
 * Inspects jobs in the DLQ with optional queue filter and limit.
 */
export async function inspectDLQ(filter?: {
  queue?: string;
  limit?: number;
}): Promise<DLQJobRecord[]> {
  let records = Array.from(dlqStore.values());

  if (filter?.queue) {
    records = records.filter((r) => r.originalQueue === filter.queue);
  }

  // Sort descending by failedAt time
  records.sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());

  if (filter?.limit && filter.limit > 0) {
    records = records.slice(0, filter.limit);
  }

  return records;
}

/**
 * Gets DLQ metrics including total count, count per queue, and alert status.
 */
export async function getDLQMetrics(): Promise<{
  totalCount: number;
  perQueue: Record<string, number>;
  isAlerting: boolean;
  threshold: number;
}> {
  const threshold = Number(process.env.DLQ_ALERT_THRESHOLD || DEFAULT_DLQ_ALERT_THRESHOLD);
  const records = Array.from(dlqStore.values());
  const totalCount = records.length;
  const perQueue: Record<string, number> = {};

  for (const record of records) {
    perQueue[record.originalQueue] = (perQueue[record.originalQueue] || 0) + 1;
  }

  const isAlerting = totalCount > threshold;

  return {
    totalCount,
    perQueue,
    isAlerting,
    threshold,
  };
}

/**
 * Checks DLQ metrics and triggers an alert if depth exceeds threshold.
 */
export async function checkDLQMetricsAlert(): Promise<boolean> {
  const metrics = await getDLQMetrics();
  if (metrics.isAlerting) {
    logger.error(
      `ALERT: Dead Letter Queue depth (${metrics.totalCount}) exceeds alert threshold (${metrics.threshold})!`
    );
  }
  return metrics.isAlerting;
}

const queueRegistry: Record<string, any> = {
  [WEBHOOK_DELIVERY_QUEUE_NAME]: webhookDeliveryQueue,
  [EXPORT_QUEUE_NAME]: exportQueue,
  [BACKUP_QUEUE_NAME]: backupQueue,
  [STORAGE_PIN_QUEUE_NAME]: storagePinQueue,
};

/**
 * Replays a single DLQ job back to its original BullMQ queue.
 */
export async function replayDLQJob(
  dlqId: string
): Promise<{ success: boolean; replayedJobId?: string; error?: string }> {
  const record = dlqStore.get(dlqId);
  if (!record) {
    return { success: false, error: `DLQ record with id ${dlqId} not found` };
  }

  try {
    const targetQueue = queueRegistry[record.originalQueue];
    let replayedJobId: string | undefined;

    if (targetQueue && typeof targetQueue.add === 'function') {
      const job = await targetQueue.add(record.jobName, record.data, record.opts);
      replayedJobId = job?.id ? String(job.id) : `replayed_${Date.now()}`;
    } else {
      replayedJobId = `replayed_simulated_${Date.now()}`;
    }

    dlqStore.delete(dlqId);
    logger.info(
      `Replayed DLQ job ${dlqId} (traceId: ${record.traceId}) to queue ${record.originalQueue}`
    );

    return { success: true, replayedJobId };
  } catch (err: any) {
    logger.error(`Failed to replay DLQ job ${dlqId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Replays all matching DLQ jobs back to their original queue.
 */
export async function replayAllDLQJobs(
  queueName?: string
): Promise<{ replayedCount: number; errors: string[] }> {
  const records = Array.from(dlqStore.values()).filter(
    (r) => !queueName || r.originalQueue === queueName
  );

  let replayedCount = 0;
  const errors: string[] = [];

  for (const record of records) {
    const res = await replayDLQJob(record.dlqId);
    if (res.success) {
      replayedCount++;
    } else if (res.error) {
      errors.push(res.error);
    }
  }

  return { replayedCount, errors };
}

/**
 * Purges DLQ jobs from storage.
 */
export async function purgeDLQ(queueName?: string): Promise<{ purgedCount: number }> {
  let purgedCount = 0;

  for (const [dlqId, record] of dlqStore.entries()) {
    if (!queueName || record.originalQueue === queueName) {
      dlqStore.delete(dlqId);
      purgedCount++;
    }
  }

  logger.info(`Purged ${purgedCount} DLQ jobs${queueName ? ` for queue ${queueName}` : ''}`);
  return { purgedCount };
}

/**
 * Resets DLQ storage (for testing).
 */
export function resetDLQStore(): void {
  dlqStore.clear();
}
