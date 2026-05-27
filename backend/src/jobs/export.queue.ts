import { Queue } from 'bullmq';
import { redisConnection } from '../utils/redis.js';

export const EXPORT_QUEUE_NAME = 'export-queue';

export const exportQueue = new Queue(EXPORT_QUEUE_NAME, {
  connection: redisConnection,
});
