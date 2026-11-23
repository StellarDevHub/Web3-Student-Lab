/**
 * BullMQ worker for outgoing webhook deliveries (Issue BE-015).
 *
 * - Retries follow the 48h exponential schedule via a custom backoff strategy.
 * - Deliveries to a paused endpoint (circuit open after consecutive 5xx) are
 *   deferred until the endpoint's cool-down ends without burning an attempt.
 * - Permanent failures, exhausted attempts and deliveries older than the 48h
 *   window are moved to the dead letter queue and marked failed so admins can
 *   re-trigger them manually.
 */

import { DelayedError, Job, UnrecoverableError, Worker } from 'bullmq';
import workerRegistry from '../metrics/WorkerRegistry.js';
import { enqueueToDLQ } from '../services/dlq.service.js';
import {
  computeRetryDelayMs,
  isRetryWindowExhausted,
  webhookDeliveryLog,
} from '../services/webhookDeliveryService.js';
import {
  WEBHOOK_DELIVERY_QUEUE_NAME,
  WEBHOOK_MAX_ATTEMPTS,
  webhookDeadLetterQueue,
} from '../services/webhooks/queue.js';
import type { DeadLetterWebhookJob, WebhookDeliveryJobData } from '../services/webhooks/types.js';
import { recordDeliveryState } from '../services/webhooks/dispatcher.js';
import {
  EndpointPausedError,
  PermanentWebhookDeliveryError,
  deliverWebhook,
} from '../services/webhooks/worker.js';
import logger, { traceContext } from '../utils/logger.js';

const moveToDeadLetterQueue = async (
  job: Job<WebhookDeliveryJobData>,
  error: Error
): Promise<void> => {
  const deadLetterJob: DeadLetterWebhookJob = {
    ...job.data,
    failedAt: new Date().toISOString(),
    error: error.message,
  };

  await webhookDeadLetterQueue.add(job.data.event.type as any, deadLetterJob, {
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
    async (job, token) => {
      // Issue #981: run each job inside the traceId context that was captured
      // when the job was enqueued, so all log lines carry the parent traceId.
      const traceId = job.data.traceId ?? `job-${job.id}`;
      return traceContext.run({ traceId }, async () => {
        try {
          return await deliverWebhook(job);
        } catch (error) {
          if (error instanceof EndpointPausedError) {
            logger.info(`Deferring webhook ${job.data.deliveryId}: ${error.message}`);
            await job.moveToDelayed(error.resumeAt, token);
            throw new DelayedError();
          }

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

          // `job.timestamp` is when the delivery was first enqueued.
          if (isRetryWindowExhausted(job.timestamp)) {
            const message = error instanceof Error ? error.message : String(error);
            throw new UnrecoverableError(`48h webhook retry window exhausted: ${message}`);
          }

          throw error;
        }
      });
    },
    {
      connection: (() => {
        const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
        return {
          host: redisUrl.hostname,
          port: Number(redisUrl.port) || 6379,
          password: redisUrl.password || undefined,
          maxRetriesPerRequest: null,
        };
      })(),
      concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY || '25'),
      settings: {
        backoffStrategy: (attemptsMade: number) => computeRetryDelayMs(attemptsMade),
      },
    }
  );

  webhookWorker.on('failed', async (job, error) => {
    workerRegistry.recordFailed('webhook-delivery');

    if (!job) {
      return;
    }

    const maxAttempts = Number(job.opts.attempts || WEBHOOK_MAX_ATTEMPTS);
    const exhausted = job.attemptsMade >= maxAttempts || error instanceof UnrecoverableError;
    const nextRetryAt = exhausted
      ? undefined
      : new Date(Date.now() + computeRetryDelayMs(job.attemptsMade)).toISOString();

    logger.warn(
      `Webhook delivery ${job.data.deliveryId} failed on attempt ${job.attemptsMade}/${maxAttempts}: ${error.message}`
    );

    recordDeliveryState(
      job.data.idempotencyKey ?? `${job.data.event.id}:${job.data.destination.url}`,
      exhausted ? 'dead-letted' : 'failed',
      job.data.deliveryId,
      job.data.event,
      job.data.destination,
      { attemptsMade: job.attemptsMade, error: error.message }
    );

    webhookDeliveryLog.record(job.data, {
      status: exhausted ? 'failed' : 'retrying',
      attempts: job.attemptsMade,
      lastError: error.message,
      nextRetryAt,
    });

    if (exhausted) {
      try {
        await moveToDeadLetterQueue(job, error);
      } catch (dlqError) {
        logger.error('Failed to move webhook job to dead letter queue:', dlqError);
      }
    }
  });

  webhookWorker.on('completed', (job) => {
    workerRegistry.recordCompleted('webhook-delivery');
    logger.info(`Webhook delivery ${job.data.deliveryId} completed`);
  });

  webhookWorker.on('error', (error) => {
    workerRegistry.markDegraded('webhook-delivery');
    logger.error('Webhook worker error:', error);
  });

  // Visible to the metrics exporter as worker="webhook-delivery".
  workerRegistry.register('webhook-delivery');

  return webhookWorker;
};

export const stopWebhookWorker = async (): Promise<void> => {
  if (!webhookWorker) {
    return;
  }

  await webhookWorker.close();
  webhookWorker = null;
  workerRegistry.markStopped('webhook-delivery');
};
