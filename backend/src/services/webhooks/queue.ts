import type { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import type { WebhookDeliveryJobData } from './types.js';

export const WEBHOOK_DELIVERY_QUEUE_NAME = 'webhook-delivery-queue';
export const WEBHOOK_DEAD_LETTER_QUEUE_NAME = 'webhook-dead-letter-queue';

/**
 * Jittered exponential backoff (Issue #1129): BullMQ's built-in exponential
 * strategy with a 50% jitter factor so concurrent retries to the same
 * destination don't stampede in lockstep. `delay` is the base delay in ms.
 */
export const WEBHOOK_BACKOFF_DELAY_MS = Number(process.env.WEBHOOK_BACKOFF_DELAY_MS || '1000');

export const WEBHOOK_MAX_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS || '5');

export const WEBHOOK_BACKOFF_JITTER = 0.5;

const createDefaultJobOptions = () => ({
  attempts: WEBHOOK_MAX_ATTEMPTS,
  backoff: {
    type: 'exponential' as const,
    delay: WEBHOOK_BACKOFF_DELAY_MS,
    jitter: WEBHOOK_BACKOFF_JITTER,
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 2000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 5000,
  },
  timeout: Number(process.env.WEBHOOK_REQUEST_TIMEOUT_MS || '10000'),
});

const createQueue = (name: string, defaultJobOptions?: JobsOptions) => {
  if (process.env.NODE_ENV === 'test') {
    return {
      add: async () => ({ id: `${name}:test-job` }),
      getJobCounts: async () => ({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      }),
      close: async () => undefined,
    } as unknown as Queue<WebhookDeliveryJobData>;
  }

  const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');

  return new Queue<WebhookDeliveryJobData>(name, {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
      maxRetriesPerRequest: null,
    },
    defaultJobOptions: defaultJobOptions ?? {},
  });
};

export const webhookDeliveryQueue = createQueue(WEBHOOK_DELIVERY_QUEUE_NAME, createDefaultJobOptions());

export const webhookDeadLetterQueue = createQueue(WEBHOOK_DEAD_LETTER_QUEUE_NAME, {
  removeOnComplete: true,
  removeOnFail: false,
});
