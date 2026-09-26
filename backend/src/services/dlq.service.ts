import crypto from 'crypto';
import logger from '../utils/logger.js';
import { webhookDeliveryQueue, WEBHOOK_DELIVERY_QUEUE_NAME } from './webhooks/queue.js';
import { exportQueue, EXPORT_QUEUE_NAME } from '../jobs/export.queue.js';
import { backupQueue, BACKUP_QUEUE_NAME } from '../jobs/backup.queue.js';
import { storagePinQueue, STORAGE_PIN_QUEUE_NAME } from './storage/queue.js';
import { buildSignedWebhookHeaders, canonicalizeWebhookPayload } from './webhooks/signature.js';
import type { SignedWebhookHeaders, WebhookDeliveryJobData } from './webhooks/types.js';

export type DLQFailureCategory =
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'server_error'
  | 'client_error'
  | 'validation'
  | 'unknown';

export type DLQTriageAction = 'replay' | 'escalate';

export interface DLQTriage {
  category: DLQFailureCategory;
  action: DLQTriageAction;
  retryable: boolean;
  reason: string;
  statusCode?: number;
}

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
  /** Automated failure classification used by the inspector dashboard. */
  triage?: DLQTriage;
}

export const DLQ_FAILURE_CATEGORIES: DLQFailureCategory[] = [
  'rate_limited',
  'timeout',
  'network',
  'server_error',
  'client_error',
  'validation',
  'unknown',
];

export const DLQ_TRIAGE_ACTIONS: DLQTriageAction[] = ['replay', 'escalate'];

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

function parseStatusCode(error: string): number | undefined {
  const match = error?.match(/\b([1-5]\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

const RETRYABLE_CATEGORIES = new Set<DLQFailureCategory>([
  'rate_limited',
  'timeout',
  'network',
  'server_error',
]);

function classifyFailure(
  error: string,
  statusCode?: number
): { category: DLQFailureCategory; reason: string } {
  const message = error || '';

  if (statusCode === 429 || /rate.?limit|too many requests?/i.test(message)) {
    return {
      category: 'rate_limited',
      reason: 'Destination throttled the delivery; safe to replay after backoff.',
    };
  }
  if (/timeout|timed out|etimedout|aborted|deadline/i.test(message)) {
    return { category: 'timeout', reason: 'Delivery exceeded the request deadline; safe to replay.' };
  }
  if (/econnrefused|econnreset|enotfound|eai_again|socket hang up|network|fetch failed/i.test(message)) {
    return { category: 'network', reason: 'Transient network failure; safe to replay.' };
  }
  if ((typeof statusCode === 'number' && statusCode >= 500) || /\b5\d{2}\b/.test(message)) {
    return { category: 'server_error', reason: 'Destination returned a 5xx error; safe to replay.' };
  }
  if (
    (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) ||
    /\b4\d{2}\b/.test(message)
  ) {
    return {
      category: 'client_error',
      reason: 'Destination rejected the request (4xx); escalate for review.',
    };
  }
  if (/validation|invalid|schema|malformed|bad request/i.test(message)) {
    return {
      category: 'validation',
      reason: 'Payload failed destination validation; escalate rather than replay.',
    };
  }
  return { category: 'unknown', reason: 'Unclassified failure; escalate for manual review.' };
}

/**
 * Automated failure triage: classifies a DLQ failure and recommends whether it
 * is safe to replay or should be escalated for manual inspection.
 */
export function triageDLQFailure(input: {
  error: string;
  attemptsMade?: number;
  statusCode?: number;
}): DLQTriage {
  const statusCode =
    typeof input.statusCode === 'number' ? input.statusCode : parseStatusCode(input.error);
  const { category, reason } = classifyFailure(input.error, statusCode);
  const retryable = RETRYABLE_CATEGORIES.has(category);
  const attemptsSuffix =
    typeof input.attemptsMade === 'number' ? ` (after ${input.attemptsMade} attempt(s))` : '';

  const triage: DLQTriage = {
    category,
    action: retryable ? 'replay' : 'escalate',
    retryable,
    reason: `${reason}${attemptsSuffix}`,
  };
  if (typeof statusCode === 'number') {
    triage.statusCode = statusCode;
  }
  return triage;
}

const SIGNATURE_HEADER_KEYS = new Set([
  'x-webhook-signature',
  'x-webhook-timestamp',
  'x-webhook-delivery-id',
  'x-webhook-event',
]);

/**
 * Remove any stale webhook signature headers so a replayed delivery is signed
 * with a fresh timestamp rather than a previous attempt's signature.
 */
export function stripStaleSignatureHeaders(
  headers?: Record<string, string>
): Record<string, string> {
  if (!headers) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !SIGNATURE_HEADER_KEYS.has(key.toLowerCase()))
  );
}

export function isWebhookDeliveryJobData(value: unknown): value is WebhookDeliveryJobData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<WebhookDeliveryJobData>;
  return Boolean(
    candidate.deliveryId &&
      candidate.event &&
      typeof candidate.event === 'object' &&
      candidate.destination &&
      typeof candidate.destination === 'object'
  );
}

export interface WebhookResignature {
  deliveryId: string;
  eventType: string;
  timestamp: string;
  signature: string;
  serializedPayload: string;
  headers: SignedWebhookHeaders;
}

/**
 * Cryptographically re-sign a webhook payload with a fresh timestamp so a job
 * replayed from the DLQ passes the destination's signature verification.
 */
export function reSignWebhookPayload(
  data: WebhookDeliveryJobData,
  options: { timestamp?: string; secret?: string } = {}
): WebhookResignature {
  const secret = options.secret ?? data.destination?.secret ?? process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    throw new Error(
      'WEBHOOK_SIGNING_SECRET environment variable is required to re-sign webhook payloads'
    );
  }

  const serializedPayload = canonicalizeWebhookPayload({
    event: data.event,
    metadata: data.metadata ?? {},
    deliveryId: data.deliveryId,
  });
  const timestamp = options.timestamp ?? new Date().toISOString();
  const headers = buildSignedWebhookHeaders({
    deliveryId: data.deliveryId,
    eventType: data.event.type,
    payload: serializedPayload,
    secret,
    timestamp,
  });

  return {
    deliveryId: data.deliveryId,
    eventType: data.event.type,
    timestamp,
    signature: headers['x-webhook-signature'],
    serializedPayload,
    headers,
  };
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
    opts: input.opts ?? {},
    failedAt: new Date().toISOString(),
    error: input.error,
    traceId,
    attemptsMade: input.attemptsMade,
    triage: triageDLQFailure({
      error: input.error,
      attemptsMade: input.attemptsMade,
    }),
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
 * Fetches a single DLQ record by id without loading the whole store.
 */
export async function getDLQJob(dlqId: string): Promise<DLQJobRecord | undefined> {
  return dlqStore.get(dlqId);
}

/**
 * Aggregated automated-triage view for the inspector dashboard: how many
 * records fall into each failure category and which are safe to auto-replay.
 */
export async function getDLQTriageSummary(): Promise<{
  total: number;
  byCategory: Record<DLQFailureCategory, number>;
  byAction: Record<DLQTriageAction, number>;
  replayableIds: string[];
}> {
  const byCategory = DLQ_FAILURE_CATEGORIES.reduce(
    (acc, category) => ({ ...acc, [category]: 0 }),
    {} as Record<DLQFailureCategory, number>
  );
  const byAction = DLQ_TRIAGE_ACTIONS.reduce(
    (acc, action) => ({ ...acc, [action]: 0 }),
    {} as Record<DLQTriageAction, number>
  );
  const replayableIds: string[] = [];

  for (const record of dlqStore.values()) {
    const triage = record.triage ?? triageDLQFailure({
      error: record.error,
      attemptsMade: record.attemptsMade,
    });
    byCategory[triage.category] += 1;
    byAction[triage.action] += 1;
    if (triage.action === 'replay') {
      replayableIds.push(record.dlqId);
    }
  }

  return {
    total: dlqStore.size,
    byCategory,
    byAction,
    replayableIds,
  };
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

    const jobData = record.data;
    let payload: Record<string, any> = jobData;
    if (
      record.originalQueue === WEBHOOK_DELIVERY_QUEUE_NAME &&
      isWebhookDeliveryJobData(jobData)
    ) {
      // Cryptographically re-sign with a fresh timestamp and drop any stale
      // signature headers so the replayed delivery is accepted downstream.
      const resigned = reSignWebhookPayload(jobData);
      payload = {
        ...jobData,
        destination: {
          ...jobData.destination,
          headers: stripStaleSignatureHeaders(jobData.destination?.headers),
        },
        replayed: {
          replayedAt: new Date().toISOString(),
          signature: resigned.signature,
          timestamp: resigned.timestamp,
          previousError: record.error,
        },
      };
      logger.info(
        `Re-signed webhook payload for DLQ job ${dlqId} (signature ${resigned.signature.slice(0, 20)}...)`
      );
    }

    if (targetQueue && typeof targetQueue.add === 'function') {
      const job = await targetQueue.add(record.jobName, payload, record.opts);
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
