import type { Job } from 'bullmq';
import logger from '../../utils/logger.js';
import {
  endpointCircuitBreaker,
  webhookDeliveryLog,
} from '../webhookDeliveryService.js';
import {
  buildSignedWebhookHeaders,
  canonicalizeWebhookPayload,
  resolveEndpointSecret,
} from './signature.js';
import type { WebhookDeliveryJobData } from './types.js';
import { recordDeliveryState } from './dispatcher.js';

const requestTimeoutMs = Number(process.env.WEBHOOK_REQUEST_TIMEOUT_MS || '10000');

export class PermanentWebhookDeliveryError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'PermanentWebhookDeliveryError';
  }
}

/**
 * Thrown when the destination endpoint's circuit is open (paused after
 * consecutive 5xx errors). The worker defers the job until `resumeAt`
 * without consuming a retry attempt.
 */
export class EndpointPausedError extends Error {
  constructor(public readonly endpointKey: string, public readonly resumeAt: number) {
    super(`Webhook endpoint ${endpointKey} is paused until ${new Date(resumeAt).toISOString()}`);
    this.name = 'EndpointPausedError';
  }
}

const isRetryableStatusCode = (statusCode: number): boolean => {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
};

const createAbortController = (timeoutMs: number): { controller: AbortController; timer: NodeJS.Timeout } => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return { controller, timer };
};

export const deliverWebhook = async (
  job: Job<WebhookDeliveryJobData>
): Promise<{ statusCode: number; deliveryId: string }> => {
  const payload = {
    event: job.data.event,
    metadata: job.data.metadata ?? {},
    deliveryId: job.data.deliveryId,
  };

  const { destination } = job.data;
  const attempt = (job.attemptsMade ?? 0) + 1;

  const permission = endpointCircuitBreaker.canDeliver(destination);
  if (!permission.allowed) {
    webhookDeliveryLog.record(job.data, {
      status: 'paused',
      nextRetryAt: new Date(permission.resumeAt).toISOString(),
    });
    throw new EndpointPausedError(destination.id ?? destination.url, permission.resumeAt);
  }

  const serializedPayload = canonicalizeWebhookPayload(payload);
  const timestamp = new Date().toISOString();
  const secret = resolveEndpointSecret(destination);
  const headers = buildSignedWebhookHeaders({
    deliveryId: job.data.deliveryId,
    eventType: job.data.event.type,
    payload: serializedPayload,
    secret,
    timestamp,
  });

  const { controller, timer } = createAbortController(requestTimeoutMs);
  let response: Response;

  try {
    response = await fetch(destination.url, {
      method: 'POST',
      headers: {
        ...destination.headers,
        ...headers,
      },
      body: serializedPayload,
      signal: controller.signal,
    });
  } catch (error) {
    // Network errors and timeouts count towards the endpoint's 5xx streak.
    const message = error instanceof Error ? error.message : String(error);
    endpointCircuitBreaker.recordServerError(destination, { error: message });
    webhookDeliveryLog.record(job.data, {
      status: 'retrying',
      attempts: attempt,
      lastAttemptAt: timestamp,
      lastError: message,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    logger.info(
      `Delivered webhook ${job.data.deliveryId} to ${destination.url} with status ${response.status}`
    );
    endpointCircuitBreaker.recordSuccess(destination, response.status);
    webhookDeliveryLog.record(job.data, {
      status: 'delivered',
      attempts: attempt,
      lastAttemptAt: timestamp,
      lastStatusCode: response.status,
      lastError: undefined,
      nextRetryAt: undefined,
    });
    recordDeliveryState(
      job.data.idempotencyKey ?? `${job.data.event.id}:${destination.url}`,
      'delivered',
      job.data.deliveryId,
      job.data.event,
      destination,
      { attemptsMade: job.attemptsMade }
    );
    return {
      statusCode: response.status,
      deliveryId: job.data.deliveryId,
    };
  }

  if (response.status >= 500) {
    endpointCircuitBreaker.recordServerError(destination, { statusCode: response.status });
  } else {
    endpointCircuitBreaker.recordClientResponse(destination, response.status);
  }

  if (!isRetryableStatusCode(response.status)) {
    const errorMessage = `Webhook delivery rejected with status ${response.status}`;
    webhookDeliveryLog.record(job.data, {
      status: 'failed',
      attempts: attempt,
      lastAttemptAt: timestamp,
      lastStatusCode: response.status,
      lastError: errorMessage,
    });
    throw new PermanentWebhookDeliveryError(
      errorMessage,
      response.status
    );
  }

  const responseBody = await response.text().catch(() => '');
  const errorMessage = `Retryable webhook delivery failure (${response.status}): ${responseBody || response.statusText}`;
  webhookDeliveryLog.record(job.data, {
    status: 'retrying',
    attempts: attempt,
    lastAttemptAt: timestamp,
    lastStatusCode: response.status,
    lastError: errorMessage,
  });
  throw new Error(errorMessage);
};
