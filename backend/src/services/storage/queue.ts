import type { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import type { StorageGcJobData, StoragePinJobData } from './types.js';

export const STORAGE_PIN_QUEUE_NAME = 'storage-pin-queue';
export const STORAGE_GC_QUEUE_NAME = 'storage-gc-queue';

const defaultPinJobOptions: JobsOptions = {
  attempts: Number(process.env.STORAGE_MAX_PIN_ATTEMPTS || '5'),
  backoff: {
    type: 'exponential',
    delay: Number(process.env.STORAGE_BACKOFF_DELAY_MS || '1000'),
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 1000,
  },
};

const createQueue = <T>(name: string, defaultJobOptions?: JobsOptions) => {
  if (process.env.NODE_ENV === 'test') {
    return {
      add: async () => ({ id: `${name}:test` }),
      close: async () => undefined,
    } as unknown as Queue<T>;
  }

  const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');

  return new Queue<T>(name, {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
      maxRetriesPerRequest: null,
    },
    defaultJobOptions,
  });
};

export const storagePinQueue = createQueue<StoragePinJobData>(STORAGE_PIN_QUEUE_NAME, defaultPinJobOptions);

export const storageGcQueue = createQueue<StorageGcJobData>(STORAGE_GC_QUEUE_NAME, {
  removeOnComplete: false,
  removeOnFail: false,
});

export const closeStorageQueues = async (): Promise<void> => {
  await Promise.all([storagePinQueue.close(), storageGcQueue.close()]);
};
