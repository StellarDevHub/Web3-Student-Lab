/**
 * Webhook delivery engine (Issue BE-015).
 *
 * Notifies external LMS systems and partner university portals of student
 * course completions. Builds on the BullMQ dispatcher in `./webhooks` and adds:
 *
 *   - HMAC-SHA256 `X-Hub-Signature-256` signatures computed with a per-endpoint
 *     secret over `<unix timestamp>.<nonce>.<body>`.
 *   - Receiver-side replay protection: timestamp tolerance + single-use nonces.
 *   - An exponential retry schedule spread across 48 hours.
 *   - A per-endpoint circuit breaker that pauses endpoints returning
 *     consecutive 5xx errors (one bad partner never stalls the others).
 *   - A delivery log that lets admins inspect and manually re-trigger failed
 *     deliveries.
 */

import crypto, { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import { enqueueWebhookDelivery } from './webhooks/dispatcher.js';
import {
  WEBHOOK_BACKOFF_DELAY_MS,
  WEBHOOK_BACKOFF_JITTER,
  WEBHOOK_RETRY_SCHEDULE_MS,
  WEBHOOK_RETRY_WINDOW_MS,
} from './webhooks/queue.js';
import { createHubSignature } from './webhooks/signature.js';
import type { WebhookDeliveryJobData, WebhookDestination } from './webhooks/types.js';

export { WEBHOOK_RETRY_SCHEDULE_MS, WEBHOOK_RETRY_WINDOW_MS };

// ─── Retry schedule ──────────────────────────────────────────────────────────

/**
 * Delay before the next retry, given how many attempts have already failed.
 * Used as the worker's custom BullMQ `backoffStrategy`.
 */
export const computeRetryDelayMs = (
  attemptsMade: number,
  random: () => number = Math.random
): number => {
  const index = Math.min(Math.max(attemptsMade, 1), WEBHOOK_RETRY_SCHEDULE_MS.length) - 1;
  const base = WEBHOOK_RETRY_SCHEDULE_MS[index] as number;
  const jittered = base * (1 - WEBHOOK_BACKOFF_JITTER * random());
  return Math.max(WEBHOOK_BACKOFF_DELAY_MS, Math.round(jittered));
};

/** True once a delivery first enqueued at `firstAttemptAt` is past the 48h window. */
export const isRetryWindowExhausted = (
  firstAttemptAt: number | undefined,
  now: number = Date.now()
): boolean => {
  if (!firstAttemptAt) return false;
  return now - firstAttemptAt >= WEBHOOK_RETRY_WINDOW_MS;
};

// ─── Receiver-side verification & replay protection ─────────────────────────

/**
 * Remembers nonces for the length of the timestamp tolerance window. A nonce
 * seen twice inside the window is a replay; outside the window the timestamp
 * check already rejects the request, so the nonce can be forgotten.
 */
export class NonceReplayCache {
  private seen = new Map<string, number>();

  constructor(private readonly ttlMs = 10 * 60 * 1000) {}

  /** Returns false when the nonce was already used (i.e. a replay). */
  checkAndRemember(nonce: string, now: number = Date.now()): boolean {
    this.prune(now);
    if (this.seen.has(nonce)) {
      return false;
    }
    this.seen.set(nonce, now + this.ttlMs);
    return true;
  }

  clear(): void {
    this.seen.clear();
  }

  private prune(now: number): void {
    for (const [nonce, expiresAt] of this.seen.entries()) {
      if (expiresAt <= now) {
        this.seen.delete(nonce);
      }
    }
  }
}

export const webhookReplayCache = new NonceReplayCache();

export interface HubSignatureVerificationInput {
  payload: string;
  /** Value of the `X-Hub-Signature-256` header (`sha256=<hex>`). */
  signature: string;
  /** Value of the `X-Webhook-Unix-Timestamp` header (seconds since epoch). */
  timestamp: string;
  /** Value of the `X-Webhook-Nonce` header. */
  nonce: string;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
  replayCache?: NonceReplayCache;
}

export interface HubSignatureVerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify an `X-Hub-Signature-256` signed delivery. Rejects stale timestamps,
 * reused nonces and any signature that does not match in constant time.
 */
export const verifyHubSignature = (
  input: HubSignatureVerificationInput
): HubSignatureVerificationResult => {
  const {
    payload,
    signature,
    timestamp,
    nonce,
    secret,
    toleranceSeconds = 300,
    now = Date.now(),
    replayCache = webhookReplayCache,
  } = input;

  if (!/^\d+$/.test(timestamp)) {
    return { valid: false, reason: 'Missing or malformed timestamp' };
  }
  if (!nonce) {
    return { valid: false, reason: 'Missing nonce' };
  }
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, reason: 'Timestamp outside tolerance window' };
  }

  const expected = Buffer.from(createHubSignature(payload, secret, timestamp, nonce), 'hex');
  const provided = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  // Only remember nonces of authentic requests so forged traffic cannot
  // poison the cache and block legitimate deliveries.
  if (!replayCache.checkAndRemember(nonce, now)) {
    return { valid: false, reason: 'Nonce already used (replay detected)' };
  }

  return { valid: true };
};

// ─── Per-endpoint circuit breaker ────────────────────────────────────────────

export type EndpointCircuitStatus = 'active' | 'paused' | 'probing';

export interface EndpointCircuitState {
  endpointKey: string;
  url: string;
  status: EndpointCircuitStatus;
  consecutiveServerErrors: number;
  pausedAt?: string;
  resumeAt?: string;
  lastStatusCode?: number;
  lastError?: string;
  updatedAt: string;
}

export type EndpointDeliveryPermission =
  | { allowed: true }
  | { allowed: false; resumeAt: number };

export const endpointKeyFor = (destination: Pick<WebhookDestination, 'id' | 'url'>): string =>
  destination.id ?? destination.url;

/**
 * Pauses an endpoint after `failureThreshold` consecutive 5xx / network
 * failures. After `pauseMs` a single probe delivery is let through: success
 * closes the circuit, another failure pauses it again. Admins can resume an
 * endpoint manually at any time.
 */
export class EndpointCircuitBreakerRegistry {
  private endpoints = new Map<string, EndpointCircuitState>();

  constructor(
    private readonly failureThreshold = Number(process.env.WEBHOOK_ENDPOINT_FAILURE_THRESHOLD || '5'),
    private readonly pauseMs = Number(process.env.WEBHOOK_ENDPOINT_PAUSE_MS || String(30 * 60 * 1000))
  ) {}

  canDeliver(destination: WebhookDestination, now: number = Date.now()): EndpointDeliveryPermission {
    const state = this.endpoints.get(endpointKeyFor(destination));
    if (!state || state.status !== 'paused') {
      return { allowed: true };
    }

    const resumeAt = state.resumeAt ? Date.parse(state.resumeAt) : now;
    if (now >= resumeAt) {
      this.update(destination, { status: 'probing' });
      logger.info(`Webhook endpoint ${state.endpointKey} cool-down elapsed, sending probe delivery`);
      return { allowed: true };
    }

    return { allowed: false, resumeAt };
  }

  recordSuccess(destination: WebhookDestination, statusCode: number): void {
    const state = this.endpoints.get(endpointKeyFor(destination));
    if (state?.status === 'probing' || state?.status === 'paused') {
      logger.info(`Webhook endpoint ${state.endpointKey} recovered, circuit closed`);
    }
    this.update(destination, {
      status: 'active',
      consecutiveServerErrors: 0,
      lastStatusCode: statusCode,
      pausedAt: undefined,
      resumeAt: undefined,
      lastError: undefined,
    });
  }

  /** Non-5xx responses (e.g. 4xx) break the consecutive server-error streak. */
  recordClientResponse(destination: WebhookDestination, statusCode: number): void {
    const state = this.endpoints.get(endpointKeyFor(destination));
    this.update(destination, {
      status: state?.status === 'probing' ? 'active' : state?.status ?? 'active',
      consecutiveServerErrors: 0,
      lastStatusCode: statusCode,
    });
  }

  recordServerError(
    destination: WebhookDestination,
    details: { statusCode?: number; error?: string },
    now: number = Date.now()
  ): EndpointCircuitState {
    const current = this.endpoints.get(endpointKeyFor(destination));
    const consecutiveServerErrors = (current?.consecutiveServerErrors ?? 0) + 1;
    const shouldPause =
      current?.status === 'probing' || consecutiveServerErrors >= this.failureThreshold;

    const next = this.update(destination, {
      consecutiveServerErrors,
      lastStatusCode: details.statusCode,
      lastError: details.error,
      ...(shouldPause
        ? {
            status: 'paused' as const,
            pausedAt: new Date(now).toISOString(),
            resumeAt: new Date(now + this.pauseMs).toISOString(),
          }
        : {}),
    });

    if (shouldPause && current?.status !== 'paused') {
      logger.warn(
        `Webhook endpoint ${next.endpointKey} paused after ${consecutiveServerErrors} consecutive server errors`
      );
    }
    return next;
  }

  /** Manually resume a paused endpoint (admin action). */
  resume(endpointKey: string): EndpointCircuitState | undefined {
    const state = this.endpoints.get(endpointKey);
    if (!state) return undefined;
    const resumed: EndpointCircuitState = {
      ...state,
      status: 'active',
      consecutiveServerErrors: 0,
      updatedAt: new Date().toISOString(),
    };
    delete resumed.pausedAt;
    delete resumed.resumeAt;
    this.endpoints.set(endpointKey, resumed);
    logger.info(`Webhook endpoint ${endpointKey} manually resumed`);
    return resumed;
  }

  get(endpointKey: string): EndpointCircuitState | undefined {
    return this.endpoints.get(endpointKey);
  }

  list(): EndpointCircuitState[] {
    return Array.from(this.endpoints.values()).sort((a, b) =>
      a.endpointKey.localeCompare(b.endpointKey)
    );
  }

  reset(): void {
    this.endpoints.clear();
  }

  private update(
    destination: WebhookDestination,
    patch: Partial<Omit<EndpointCircuitState, 'endpointKey' | 'url' | 'updatedAt'>>
  ): EndpointCircuitState {
    const endpointKey = endpointKeyFor(destination);
    const current = this.endpoints.get(endpointKey);
    const next: EndpointCircuitState = {
      endpointKey,
      url: destination.url,
      status: 'active',
      consecutiveServerErrors: 0,
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    for (const key of Object.keys(next)) {
      if ((next as unknown as Record<string, unknown>)[key] === undefined) {
        delete (next as unknown as Record<string, unknown>)[key];
      }
    }
    this.endpoints.set(endpointKey, next);
    return next;
  }
}

export const endpointCircuitBreaker = new EndpointCircuitBreakerRegistry();

// ─── Delivery log & manual re-trigger ────────────────────────────────────────

export type WebhookDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'retrying'
  | 'paused'
  | 'failed'
  | 'retriggered';

export interface WebhookDeliveryRecord {
  deliveryId: string;
  idempotencyKey: string;
  endpointKey: string;
  destinationUrl: string;
  eventId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  lastStatusCode?: number;
  lastError?: string;
  retriggeredFrom?: string;
  retriggeredAs?: string;
  retriggeredBy?: string;
}

interface StoredDelivery {
  record: WebhookDeliveryRecord;
  job: WebhookDeliveryJobData;
}

const DELIVERY_LOG_LIMIT = Number(process.env.WEBHOOK_DELIVERY_LOG_LIMIT || '5000');

export class WebhookDeliveryLog {
  private deliveries = new Map<string, StoredDelivery>();

  record(
    job: WebhookDeliveryJobData,
    patch: Partial<Omit<WebhookDeliveryRecord, 'deliveryId'>> = {}
  ): WebhookDeliveryRecord {
    const existing = this.deliveries.get(job.deliveryId);
    const record: WebhookDeliveryRecord = {
      deliveryId: job.deliveryId,
      idempotencyKey: job.idempotencyKey ?? `${job.event.id}:${job.destination.url}`,
      endpointKey: endpointKeyFor(job.destination),
      destinationUrl: job.destination.url,
      eventId: job.event.id,
      eventType: job.event.type,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      ...existing?.record,
      ...patch,
    };
    for (const key of Object.keys(record)) {
      if ((record as unknown as Record<string, unknown>)[key] === undefined) {
        delete (record as unknown as Record<string, unknown>)[key];
      }
    }

    // Re-insert so the map stays ordered by most recent activity.
    this.deliveries.delete(job.deliveryId);
    this.deliveries.set(job.deliveryId, { record, job });
    this.evict();
    return record;
  }

  get(deliveryId: string): WebhookDeliveryRecord | undefined {
    return this.deliveries.get(deliveryId)?.record;
  }

  getJob(deliveryId: string): WebhookDeliveryJobData | undefined {
    return this.deliveries.get(deliveryId)?.job;
  }

  list(filter: { status?: string; endpointKey?: string; eventType?: string; limit?: number } = {}): WebhookDeliveryRecord[] {
    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 500) : 100;
    const results: WebhookDeliveryRecord[] = [];
    const entries = Array.from(this.deliveries.values()).reverse();
    for (const { record } of entries) {
      if (filter.status && record.status !== filter.status) continue;
      if (filter.endpointKey && record.endpointKey !== filter.endpointKey) continue;
      if (filter.eventType && record.eventType !== filter.eventType) continue;
      results.push(record);
      if (results.length >= limit) break;
    }
    return results;
  }

  reset(): void {
    this.deliveries.clear();
  }

  private evict(): void {
    while (this.deliveries.size > DELIVERY_LOG_LIMIT) {
      const oldest = this.deliveries.keys().next().value;
      if (oldest === undefined) break;
      this.deliveries.delete(oldest);
    }
  }
}

export const webhookDeliveryLog = new WebhookDeliveryLog();

export class WebhookRetriggerError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'WebhookRetriggerError';
  }
}

/**
 * Manually re-trigger a delivery (admin action). The original job is cloned
 * under a fresh idempotency key so it bypasses duplicate suppression, and the
 * new attempt starts its own 48h retry window. Optionally resumes the
 * endpoint's circuit so the delivery isn't immediately deferred again.
 */
export const retriggerDelivery = async (
  deliveryId: string,
  options: { resumeEndpoint?: boolean; requestedBy?: string } = {}
): Promise<{ deliveryId: string; retriggeredFrom: string }> => {
  const original = webhookDeliveryLog.getJob(deliveryId);
  const record = webhookDeliveryLog.get(deliveryId);
  if (!original || !record) {
    throw new WebhookRetriggerError('Delivery not found', 404);
  }
  if (record.status === 'delivered') {
    throw new WebhookRetriggerError('Delivery already succeeded', 409);
  }
  if (record.status === 'retriggered') {
    throw new WebhookRetriggerError(`Delivery already re-triggered as ${record.retriggeredAs}`, 409);
  }

  if (options.resumeEndpoint) {
    endpointCircuitBreaker.resume(record.endpointKey);
  }

  const idempotencyKey = `${record.idempotencyKey}:retrigger:${randomUUID()}`;
  const metadata = { ...original.metadata, retriggeredFrom: deliveryId };
  const result = await enqueueWebhookDelivery({
    destination: original.destination,
    event: original.event,
    metadata,
    idempotencyKey,
  });

  webhookDeliveryLog.record(original, {
    status: 'retriggered',
    retriggeredAs: result.deliveryId,
  });
  webhookDeliveryLog.record(
    { ...original, metadata, deliveryId: result.deliveryId, idempotencyKey },
    {
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      retriggeredFrom: deliveryId,
      ...(options.requestedBy ? { retriggeredBy: options.requestedBy } : {}),
    }
  );

  logger.info(`Webhook delivery ${deliveryId} manually re-triggered as ${result.deliveryId}`);
  return { deliveryId: result.deliveryId, retriggeredFrom: deliveryId };
};

/** Re-trigger every failed delivery, optionally scoped to one endpoint. */
export const retriggerFailedDeliveries = async (
  options: { endpointKey?: string; requestedBy?: string; limit?: number } = {}
): Promise<Array<{ deliveryId: string; retriggeredFrom: string }>> => {
  const failed = webhookDeliveryLog.list({
    status: 'failed',
    ...(options.endpointKey ? { endpointKey: options.endpointKey } : {}),
    limit: options.limit ?? 500,
  });

  const results: Array<{ deliveryId: string; retriggeredFrom: string }> = [];
  for (const record of failed) {
    results.push(
      await retriggerDelivery(record.deliveryId, {
        ...(options.requestedBy ? { requestedBy: options.requestedBy } : {}),
      })
    );
  }
  return results;
};
