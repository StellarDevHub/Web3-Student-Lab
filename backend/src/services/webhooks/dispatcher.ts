import { randomUUID } from 'crypto';
import type { JobsOptions } from 'bullmq';
import logger, { getTraceId } from '../../utils/logger.js';
import {
  webhookDeliveryQueue,
  WEBHOOK_DELIVERY_QUEUE_NAME,
} from './queue.js';
import type {
  WebhookDeliveryJobData,
  WebhookDeliveryRequest,
  WebhookDestination,
  WebhookEventPayload,
  WebhookDeliveryHistoryEntry,
  WebhookDeliveryState,
} from './types.js';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const deliveryHistory = new Map<string, WebhookDeliveryHistoryEntry>();

const cleanExpiredHistory = (): void => {
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [key, entry] of deliveryHistory.entries()) {
    if (new Date(entry.updatedAt).getTime() < cutoff) {
      deliveryHistory.delete(key);
    }
  }
};

export const buildIdempotencyKey = (
  event: WebhookEventPayload,
  destination: WebhookDestination
): string => {
  return `${event.id}:${destination.url}`;
};

export const getDeliveryHistory = (): WebhookDeliveryHistoryEntry[] => {
  cleanExpiredHistory();
  return Array.from(deliveryHistory.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
};

export const recordDeliveryState = (
  idempotencyKey: string,
  state: WebhookDeliveryState,
  deliveryId: string,
  event: WebhookEventPayload,
  destination: WebhookDestination,
  overrides?: Partial<Pick<WebhookDeliveryHistoryEntry, 'attemptsMade' | 'error'>>
): void => {
  cleanExpiredHistory();
  const existing = deliveryHistory.get(idempotencyKey);
  const now = new Date().toISOString();

  if (existing && existing.state === 'delivered' && state === 'pending') {
    return;
  }

  deliveryHistory.set(idempotencyKey, {
    idempotencyKey,
    state,
    deliveryId,
    destinationUrl: destination.url,
    eventId: event.id,
    eventType: event.type,
    updatedAt: now,
    ...(overrides?.attemptsMade !== undefined ? { attemptsMade: overrides.attemptsMade } : {}),
    ...(overrides?.error !== undefined ? { error: overrides.error } : {}),
  });
};

export const isDuplicateDelivery = (idempotencyKey: string): boolean => {
  cleanExpiredHistory();
  const existing = deliveryHistory.get(idempotencyKey);
  if (!existing) return false;
  return existing.state === 'pending' || existing.state === 'delivered';
};

export const buildWebhookDeliveryJob = (request: WebhookDeliveryRequest): WebhookDeliveryJobData => {
  const idempotencyKey = request.idempotencyKey ?? buildIdempotencyKey(request.event, request.destination);
  return {
    deliveryId: randomUUID(),
    destination: request.destination,
    event: request.event,
    metadata: request.metadata ?? {},
    traceId: getTraceId() as string,
    idempotencyKey,
  };
};

export const buildWebhookJobOptions = (overrides: Partial<JobsOptions> = {}): JobsOptions => {
  return {
    priority: 10,
    ...overrides,
  };
};

export const enqueueWebhookDelivery = async (
  request: WebhookDeliveryRequest,
  overrides: Partial<JobsOptions> = {}
): Promise<{ deliveryId: string; queue: string; duplicate?: boolean }> => {
  return enqueueWebhookDeliveryToQueue(webhookDeliveryQueue, request, overrides);
};

export const enqueueWebhookDeliveryToQueue = async (
  queue: Pick<typeof webhookDeliveryQueue, 'add'>,
  request: WebhookDeliveryRequest,
  overrides: Partial<JobsOptions> = {}
): Promise<{ deliveryId: string; queue: string; duplicate?: boolean }> => {
  const idempotencyKey = request.idempotencyKey ?? buildIdempotencyKey(request.event, request.destination);

  if (isDuplicateDelivery(idempotencyKey)) {
    const existing = deliveryHistory.get(idempotencyKey)!;
    logger.info(`Duplicate webhook delivery suppressed for ${idempotencyKey}`);
    return {
      deliveryId: existing.deliveryId,
      queue: WEBHOOK_DELIVERY_QUEUE_NAME,
      duplicate: true,
    };
  }

  const job = buildWebhookDeliveryJob({ ...request, idempotencyKey });
  recordDeliveryState(idempotencyKey, 'pending', job.deliveryId, job.event, job.destination);

  await queue.add(job.event.type as any, job, {
    ...buildWebhookJobOptions(overrides),
    jobId: idempotencyKey,
  });

  logger.info(`Queued webhook delivery ${job.deliveryId} for ${job.destination.url}`);

  return {
    deliveryId: job.deliveryId,
    queue: WEBHOOK_DELIVERY_QUEUE_NAME,
  };
};

export const enqueueWebhookDeliveries = async (
  event: WebhookEventPayload,
  destinations: WebhookDestination[],
  metadata: Record<string, unknown> = {}
): Promise<Array<{ deliveryId: string; queue: string; duplicate?: boolean }>> => {
  const jobs = destinations.map((destination) =>
    enqueueWebhookDelivery({
      destination,
      event,
      metadata,
    })
  );

  return Promise.all(jobs);
};
