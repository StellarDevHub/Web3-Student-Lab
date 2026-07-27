import { Queue } from 'bullmq';

export const EXPORT_QUEUE_NAME = 'export-queue';

const redisUrl = new URL(process.env.REDIS_URL || (() => {
  throw new Error('REDIS_URL environment variable is required');
})());

export const exportQueue = new Queue(EXPORT_QUEUE_NAME, {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'linear',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 2000,
    },
  },
});
