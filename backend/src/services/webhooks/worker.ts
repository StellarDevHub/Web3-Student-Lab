import { Job, Worker } from 'bullmq';
import logger from '../../utils/logger.js';
import {
    WEBHOOK_DELIVERY_QUEUE_NAME,
    webhookDeadLetterQueue,
} from './queue.js';
import { buildSignedWebhookHeaders, canonicalizeWebhookPayload } from './signature.js';
import type { DeadLetterWebhookJob, WebhookDeliveryJobData } from './types.js';

const requestTimeoutMs = Number(process.env.WEBHOOK_REQUEST_TIMEOUT_MS || '10000');

export class PermanentWebhookDeliveryError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'PermanentWebhookDeliveryError';
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

  const serializedPayload = canonicalizeWebhookPayload(payload);
  const timestamp = new Date().toISOString();
  const secret = job.data.destination.secret || process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    throw new Error('WEBHOOK_SIGNING_SECRET environment variable is required');
  }
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
    response = await fetch(job.data.destination.url, {
      method: 'POST',
      headers: {
        ...headers,
        ...job.data.destination.headers,
      },
      body: serializedPayload,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    logger.info(
      `Delivered webhook ${job.data.deliveryId} to ${job.data.destination.url} with status ${response.status}`
    );
    return {
      statusCode: response.status,
      deliveryId: job.data.deliveryId,
    };
  }

  if (!isRetryableStatusCode(response.status)) {
    throw new PermanentWebhookDeliveryError(
      `Webhook delivery rejected with status ${response.status}`,
      response.status
    );
  }

  const responseBody = await response.text().catch(() => '');
  throw new Error(
    `Retryable webhook delivery failure (${response.status}): ${responseBody || response.statusText}`
  );
};

import { enqueueToDLQ } from '../dlq.service.js';

const moveToDeadLetterQueue = async (
  job: Job<WebhookDeliveryJobData>,
  error: Error
): Promise<void> => {
  const deadLetterJob: DeadLetterWebhookJob = {
    ...job.data,
    failedAt: new Date().toISOString(),
    error: error.message,
  };

  await webhookDeadLetterQueue.add(job.data.event.type, deadLetterJob, {
    removeOnComplete: true,
    removeOnFail: false,
  });

  await enqueueToDLQ({
    originalQueue: WEBHOOK_DELIVERY_QUEUE_NAME,
    jobName: job.data.event.type,
    data: job.data as any,
    opts: job.opts as any,
    error: error.message,
    traceId: (job.data as any).traceId || job.data.deliveryId || job.data.event.id,
    attemptsMade: job.attemptsMade || 1,
  });
};

let webhookWorker: Worker<WebhookDeliveryJobData> | null = null;

export const startWebhookWorker = (): Worker<WebhookDeliveryJobData> | null => {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  if (webhookWorker) {
    return webhookWorker;
  }

  webhookWorker = new Worker<WebhookDeliveryJobData>(
    WEBHOOK_DELIVERY_QUEUE_NAME,
    async (job) => {
      try {
        return await deliverWebhook(job);
      } catch (error) {
        if (error instanceof PermanentWebhookDeliveryError) {
          try {
            await moveToDeadLetterQueue(job, error);
            logger.warn(
              `Webhook ${job.data.deliveryId} sent to DLQ after permanent failure: ${error.message}`
            );
          } catch (dlqError) {
            logger.error('Failed to enqueue permanent webhook failure to DLQ:', dlqError);
          }
          return {
            statusCode: error.statusCode || 400,
            deliveryId: job.data.deliveryId,
          };
        }

        throw error;
      }
    },
    {
      connection: {
        host: new URL(process.env.REDIS_URL || (() => {
          throw new Error('REDIS_URL environment variable is required');
        })()).hostname,
        port: Number(new URL(process.env.REDIS_URL || (() => {
          throw new Error('REDIS_URL environment variable is required');
        })()).port) || 6379,
        password: new URL(process.env.REDIS_URL || (() => {
          throw new Error('REDIS_URL environment variable is required');
        })()).password || undefined,
        maxRetriesPerRequest: null,
      },
      concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY || '25'),
    }
  );

  webhookWorker.on('failed', async (job, error) => {
    if (!job) {
      return;
    }

    const maxAttempts = Number(job.opts.attempts || process.env.WEBHOOK_MAX_ATTEMPTS || '5');
    const exhausted = job.attemptsMade >= maxAttempts;

    logger.warn(
      `Webhook delivery ${job.data.deliveryId} failed on attempt ${job.attemptsMade}/${maxAttempts}: ${error.message}`
    );

    if (exhausted) {
      try {
        await moveToDeadLetterQueue(job, error);
      } catch (dlqError) {
        logger.error('Failed to move webhook job to dead letter queue:', dlqError);
      }
    }
  });

  webhookWorker.on('completed', (job) => {
    logger.info(`Webhook delivery ${job.data.deliveryId} completed`);
  });

  webhookWorker.on('error', (error) => {
    logger.error('Webhook worker error:', error);
  });

  return webhookWorker;
};

export const stopWebhookWorker = async (): Promise<void> => {
  if (!webhookWorker) {
    return;
  }

  await webhookWorker.close();
  webhookWorker = null;
};
