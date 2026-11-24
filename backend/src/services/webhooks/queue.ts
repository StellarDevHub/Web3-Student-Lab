import type { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import type { WebhookDeliveryJobData } from './types.js';

export const WEBHOOK_DELIVERY_QUEUE_NAME = 'webhook-delivery-queue';
export const WEBHOOK_DEAD_LETTER_QUEUE_NAME = 'webhook-dead-letter-queue';

/**
 * Jittered backoff (Issue #1129): each scheduled delay is shortened by up to
 * 50% at random so concurrent retries to the same destination don't stampede
 * in lockstep. Jitter only ever shortens a delay, keeping retries inside the
 * 48h window below.
 */
export const WEBHOOK_BACKOFF_DELAY_MS = Number(process.env.WEBHOOK_BACKOFF_DELAY_MS || '1000');

export const WEBHOOK_BACKOFF_JITTER = 0.5;

/**
 * Exponential retry schedule spread across a 48 hour window (Issue BE-015).
 * Entry `n` is the delay before retry `n + 1`; the cumulative schedule is
 * ~45.7h so the final retry still lands inside the 48h delivery window.
 */
export const WEBHOOK_RETRY_SCHEDULE_MS: readonly number[] = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  8 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  18 * 60 * 60 * 1000,
];

export const WEBHOOK_RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Custom BullMQ backoff type resolved by the worker's `backoffStrategy`. */
export const WEBHOOK_BACKOFF_STRATEGY = 'webhook-48h';

export const WEBHOOK_MAX_ATTEMPTS = Number(
  process.env.WEBHOOK_MAX_ATTEMPTS || String(WEBHOOK_RETRY_SCHEDULE_MS.length + 1)
);

const createDefaultJobOptions = () => ({
  attempts: WEBHOOK_MAX_ATTEMPTS,
  backoff: {
    type: WEBHOOK_BACKOFF_STRATEGY,
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
