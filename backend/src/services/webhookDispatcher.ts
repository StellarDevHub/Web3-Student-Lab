/**
 * Real-Time Webhook Dispatch Engine (Issue BE-075).
 *
 * Provides a cohesive entry point for:
 *  - Dispatching webhook events to external university/LMS endpoints via BullMQ.
 *  - Cryptographic HMAC-SHA256 payload signing (`X-Signature-SHA256`) and
 *    constant-time verification.
 *  - 5-second request timeout enforcement and 72-hour exponential backoff retries.
 *  - Failure analysis and manual replay triggers for the admin dashboard.
 */

import {
  endpointCircuitBreaker,
  retriggerDelivery,
  retriggerFailedDeliveries,
  webhookDeliveryLog,
  type EndpointCircuitState,
  type WebhookDeliveryRecord,
} from './webhookDeliveryService.js';
import {
  buildSignedWebhookHeaders,
  canonicalizeWebhookPayload,
  createPayloadSignatureSha256,
  enqueueWebhookDeliveries,
  enqueueWebhookDelivery,
  verifyPayloadSignatureSha256,
  WEBHOOK_DELIVERY_QUEUE_NAME,
  WEBHOOK_REQUEST_TIMEOUT_MS,
  WEBHOOK_RETRY_SCHEDULE_MS,
  WEBHOOK_RETRY_WINDOW_MS,
  webhookDeadLetterQueue,
  webhookDeliveryQueue,
  type WebhookDeliveryRequest,
  type WebhookDestination,
  type WebhookEventPayload,
} from './webhooks/index.js';

export {
  buildSignedWebhookHeaders,
  canonicalizeWebhookPayload,
  WEBHOOK_DELIVERY_QUEUE_NAME,
  WEBHOOK_REQUEST_TIMEOUT_MS,
  WEBHOOK_RETRY_SCHEDULE_MS,
  WEBHOOK_RETRY_WINDOW_MS,
};

export const signWebhookPayload = (payload: string | unknown, secret: string): string => {
  const serialized = typeof payload === 'string' ? payload : canonicalizeWebhookPayload(payload);
  return createPayloadSignatureSha256(serialized, secret);
};

export const verifyWebhookPayloadSignature = (
  payload: string | unknown,
  signature: string,
  secret: string
): boolean => {
  const serialized = typeof payload === 'string' ? payload : canonicalizeWebhookPayload(payload);
  return verifyPayloadSignatureSha256(serialized, signature, secret);
};

/**
 * Enqueue a single webhook delivery onto the BullMQ delivery queue and record
 * its initial state in the delivery log for real-time admin inspection.
 */
export const dispatchWebhook = async (
  request: WebhookDeliveryRequest
): Promise<{ deliveryId: string; queue: string; duplicate?: boolean }> => {
  const result = await enqueueWebhookDelivery(request);
  if (!result.duplicate) {
    webhookDeliveryLog.record(
      {
        ...request,
        deliveryId: result.deliveryId,
        idempotencyKey: request.idempotencyKey ?? `${request.event.id}:${request.destination.url}`,
      },
      { status: 'pending', attempts: 0 }
    );
  }
  return result;
};

/**
 * Fan out a completion or platform event to one or more university/LMS
 * destinations via the BullMQ webhook dispatch queue.
 */
export const dispatchWebhookEvent = async (
  event: WebhookEventPayload,
  destinations: WebhookDestination[],
  metadata: Record<string, unknown> = {}
): Promise<Array<{ deliveryId: string; queue: string; duplicate?: boolean }>> => {
  const results = await enqueueWebhookDeliveries(event, destinations, metadata);
  results.forEach((result, idx) => {
    const destination = destinations[idx];
    if (destination && !result.duplicate) {
      webhookDeliveryLog.record(
        {
          deliveryId: result.deliveryId,
          destination,
          event,
          metadata,
          idempotencyKey: `${event.id}:${destination.url}`,
        },
        { status: 'pending', attempts: 0 }
      );
    }
  });
  return results;
};

export interface EndpointFailureSummary {
  endpointKey: string;
  destinationUrl: string;
  failedCount: number;
  retryingCount: number;
  pausedCount: number;
  lastStatusCode?: number;
  lastError?: string;
  circuitStatus: EndpointCircuitState['status'];
}

export interface WebhookFailureAnalysis {
  generatedAt: string;
  retryWindowHours: number;
  timeoutMs: number;
  totals: {
    total: number;
    delivered: number;
    pending: number;
    retrying: number;
    paused: number;
    failed: number;
    retriggered: number;
    successRate: number;
  };
  failuresByCategory: Record<string, number>;
  failuresByEndpoint: EndpointFailureSummary[];
  recentFailures: WebhookDeliveryRecord[];
  queueCounts: {
    delivery: Record<string, number>;
    deadLetter: Record<string, number>;
  };
}

const classifyFailure = (record: WebhookDeliveryRecord): string => {
  if (record.lastStatusCode) {
    if (record.lastStatusCode >= 500) return `http_${record.lastStatusCode}`;
    if (record.lastStatusCode === 429) return 'http_429_rate_limited';
    if (record.lastStatusCode === 408) return 'http_408_timeout';
    return `http_${record.lastStatusCode}`;
  }
  const err = (record.lastError ?? '').toLowerCase();
  if (err.includes('abort') || err.includes('timeout')) return 'timeout';
  if (err.includes('econnrefused') || err.includes('enotfound') || err.includes('network')) {
    return 'network_error';
  }
  return 'unknown_error';
};

/**
 * Compute failure analysis metrics for the admin dashboard: success rate,
 * failure categorization (5xx, timeouts, network errors), per-endpoint health,
 * and live BullMQ queue depths.
 */
export const analyzeWebhookFailures = async (
  options: { endpointKey?: string; limit?: number } = {}
): Promise<WebhookFailureAnalysis> => {
  const deliveries = webhookDeliveryLog.list({
    ...(options.endpointKey ? { endpointKey: options.endpointKey } : {}),
    limit: 500,
  });

  const totals = {
    total: deliveries.length,
    delivered: 0,
    pending: 0,
    retrying: 0,
    paused: 0,
    failed: 0,
    retriggered: 0,
    successRate: 100,
  };

  const failuresByCategory: Record<string, number> = {};
  const endpointMap = new Map<string, EndpointFailureSummary>();
  const recentFailures: WebhookDeliveryRecord[] = [];
  const failureLimit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 25;

  for (const record of deliveries) {
    totals[record.status] += 1;

    if (record.status === 'failed' || record.status === 'retrying' || record.status === 'paused') {
      const category = classifyFailure(record);
      failuresByCategory[category] = (failuresByCategory[category] ?? 0) + 1;

      if (recentFailures.length < failureLimit) {
        recentFailures.push(record);
      }

      const existing = endpointMap.get(record.endpointKey) ?? {
        endpointKey: record.endpointKey,
        destinationUrl: record.destinationUrl,
        failedCount: 0,
        retryingCount: 0,
        pausedCount: 0,
        circuitStatus: endpointCircuitBreaker.get(record.endpointKey)?.status ?? 'active',
      };

      if (record.status === 'failed') existing.failedCount += 1;
      if (record.status === 'retrying') existing.retryingCount += 1;
      if (record.status === 'paused') existing.pausedCount += 1;
      if (!existing.lastStatusCode && record.lastStatusCode !== undefined) {
        existing.lastStatusCode = record.lastStatusCode;
      }
      if (!existing.lastError && record.lastError) {
        existing.lastError = record.lastError;
      }
      endpointMap.set(record.endpointKey, existing);
    }
  }

  const completedCount = totals.delivered + totals.failed;
  totals.successRate =
    completedCount > 0 ? Math.round((totals.delivered / completedCount) * 10000) / 100 : 100;

  const [deliveryCounts, deadLetterCounts] = await Promise.all([
    webhookDeliveryQueue.getJobCounts().catch(() => ({})),
    webhookDeadLetterQueue.getJobCounts().catch(() => ({})),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    retryWindowHours: WEBHOOK_RETRY_WINDOW_MS / (60 * 60 * 1000),
    timeoutMs: WEBHOOK_REQUEST_TIMEOUT_MS,
    totals,
    failuresByCategory,
    failuresByEndpoint: Array.from(endpointMap.values()).sort(
      (a, b) => b.failedCount + b.retryingCount - (a.failedCount + a.retryingCount)
    ),
    recentFailures,
    queueCounts: {
      delivery: deliveryCounts as Record<string, number>,
      deadLetter: deadLetterCounts as Record<string, number>,
    },
  };
};

export const replayWebhookDelivery = retriggerDelivery;
export const replayFailedWebhooks = retriggerFailedDeliveries;
