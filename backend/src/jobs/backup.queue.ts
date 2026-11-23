import { Queue } from 'bullmq';

export const BACKUP_QUEUE_NAME = 'backup-queue';

const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');

export const backupQueue = new Queue(BACKUP_QUEUE_NAME, {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: {
      age: 7 * 24 * 60 * 60,
      count: 100,
    },
    removeOnFail: {
      age: 30 * 24 * 60 * 60,
      count: 50,
    },
  },
});
