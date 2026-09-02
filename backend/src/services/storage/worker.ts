import { Job, Worker } from 'bullmq';
import logger from '../../utils/logger.js';
import * as defaultRepository from './asset.repository.js';
import { createStorageProvider } from './provider.js';
import { STORAGE_GC_QUEUE_NAME, STORAGE_PIN_QUEUE_NAME, storageGcQueue } from './queue.js';
import { enqueueToDLQ } from '../dlq.service.js';
import workerRegistry from '../../metrics/WorkerRegistry.js';
import type {
    StorageAssetRecord,
    StorageGcJobData,
    StoragePinJobData,
    StoragePinResult,
    StorageProvider,
} from './types.js';
import { buildGatewayUrl, buildIpfsUri } from './utils.js';

const provider = createStorageProvider();
const retentionDays = Number(process.env.STORAGE_GC_RETENTION_DAYS || '30');

export interface StorageWorkerRepository {
  upsertStorageAsset: typeof defaultRepository.upsertStorageAsset;
  markAssetFailed: typeof defaultRepository.markAssetFailed;
  listUnreferencedAssets: typeof defaultRepository.listUnreferencedAssets;
  markAssetUnpinned: typeof defaultRepository.markAssetUnpinned;
}

export interface StorageWorkerDependencies {
  provider?: StorageProvider;
  repository?: StorageWorkerRepository;
}

const defaultWorkerRepository: StorageWorkerRepository = defaultRepository;

/**
 * Handle storage operation failures by sending to DLQ.
 * Called when a storage pin job has exhausted all retry attempts.
 */
export const handleStorageFailure = async (
  job: Job<StoragePinJobData>,
  error: any,
  errorMessage: string
): Promise<void> => {
  try {
    await enqueueToDLQ({
      originalQueue: STORAGE_PIN_QUEUE_NAME,
      jobName: job.name || 'pin-storage',
      data: job.data,
      opts: job.opts,
      error: errorMessage,
      traceId: (job.data.metadata?.traceId || job.id?.toString() || `storage_${Date.now()}`) as string,
      attemptsMade: job.attemptsMade
    });
    
    logger.info(`Storage job ${job.id} sent to DLQ due to failure: ${errorMessage}`);
  } catch (dlqError) {
    logger.error(`Failed to send storage job ${job.id} to DLQ:`, dlqError);
  }
};

export const pinStorageContent = async (
  job: Job<StoragePinJobData>,
  _token?: string
): Promise<StoragePinResult> => {
  const payload = job.data;
  const activeProvider = provider;
  const repository = defaultWorkerRepository;

  try {
    const pinResult =
      payload.mode === 'json'
        ? await activeProvider.pinJson({
            content: payload.content,
            name: payload.name,
            metadata: payload.metadata ?? {},
          })
        : await activeProvider.pinFile({
            content: Buffer.from(payload.content as string, 'base64'),
            filename: payload.filename || payload.name,
            mimeType: payload.mimeType || 'application/octet-stream',
            metadata: payload.metadata ?? {},
          });

    await repository.upsertStorageAsset({
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      name: payload.name,
      kind: payload.kind,
      provider: pinResult.provider,
      cid: pinResult.cid,
      ipfsUri: pinResult.ipfsUri || buildIpfsUri(pinResult.cid),
      gatewayUrl: pinResult.gatewayUrl || buildGatewayUrl(pinResult.cid),
      mimeType: payload.mimeType ?? null,
      sizeBytes: pinResult.sizeBytes ?? null,
      status: 'pinned',
      referenceCount: payload.referenceCount ?? 1,
      metadata: payload.metadata ?? null,
    });

    logger.info(
      `Pinned decentralized asset ${payload.resourceType}/${payload.resourceId}/${payload.name} -> ${pinResult.cid}`
    );

    return pinResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage pinning error';

    await repository.markAssetFailed(payload.resourceType, payload.resourceId, payload.name, message);

    throw error;
  }
};

export const garbageCollectStorage = async (
  job: Job<StorageGcJobData>,
  dependencies: StorageWorkerDependencies = {}
): Promise<{
  inspected: number;
  unpinned: number;
}> => {
  const activeProvider = dependencies.provider ?? provider;
  const repository = dependencies.repository ?? defaultWorkerRepository;
  const cutoff = new Date(Date.now() - job.data.retentionDays * 24 * 60 * 60 * 1000);
  const staleAssets: StorageAssetRecord[] = await repository.listUnreferencedAssets(cutoff);

  let unpinned = 0;

  for (const asset of staleAssets) {
    if (job.data.dryRun) {
      continue;
    }

    try {
      await activeProvider.unpin(asset.cid);
      await repository.markAssetUnpinned(asset.cid);
      unpinned += 1;
      logger.info(`Unpinned stale decentralized asset ${asset.cid}`);
    } catch (error) {
      logger.warn(`Failed to unpin stale asset ${asset.cid}:`, error);
    }
  }

  return {
    inspected: staleAssets.length,
    unpinned,
  };
};

let pinWorker: Worker<StoragePinJobData> | null = null;
let gcWorker: Worker<StorageGcJobData> | null = null;

export const startStorageWorkers = (): {
  pinWorker: Worker<StoragePinJobData> | null;
  gcWorker: Worker<StorageGcJobData> | null;
} => {
  if (process.env.NODE_ENV === 'test') {
    return { pinWorker: null, gcWorker: null };
  }

  if (!pinWorker) {
    pinWorker = new Worker(STORAGE_PIN_QUEUE_NAME, pinStorageContent as any, {
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
      concurrency: Number(process.env.STORAGE_WORKER_CONCURRENCY || '10'),
    });

    // Dead-letter handling: when a pin job exhausts all retry attempts,
    // enqueue the failed payload to the DLQ for later replay.
    pinWorker.on('failed', async (job, error) => {
      if (!job) {
        logger.error('Storage pin job failed but job reference is unavailable');
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown worker error';
      const maxAttempts = Number(job.opts?.attempts || process.env.STORAGE_MAX_PIN_ATTEMPTS || '5');

      logger.error(
        `Storage pin job ${job.id} failed on attempt ${job.attemptsMade}/${maxAttempts}: ${errorMessage}`
      );

      if (job.attemptsMade >= maxAttempts) {
        logger.warn(`Storage pin job ${job.id} has exhausted all retry attempts; sending to DLQ`);
        try {
          await handleStorageFailure(job, error, errorMessage);
        } catch (dlqError) {
          logger.error(`Failed to send storage job ${job.id} to DLQ:`, dlqError);
        }
      }
    });

    pinWorker.on('completed', (job) => {
      logger.info(`Storage pin job ${job.id} completed successfully`);
    });

    pinWorker.on('stalled', (job) => {
      logger.warn(`Storage pin job ${job} appears to be stalled`);
    });

    workerRegistry.register('storage-pin', {
      concurrency: Number(process.env.STORAGE_WORKER_CONCURRENCY || '10'),
    });

    pinWorker.on('completed', () => workerRegistry.recordCompleted('storage-pin'));
    pinWorker.on('error', () => workerRegistry.markDegraded('storage-pin'));
    pinWorker.on('failed', (job, error) => {
      workerRegistry.recordFailed('storage-pin');
      logger.error(`Storage pin job ${job?.id} failed: ${error.message}`);
    });
  }

  if (!gcWorker) {
    gcWorker = new Worker(
      STORAGE_GC_QUEUE_NAME,
      async (job) => garbageCollectStorage(job),
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
        concurrency: 1,
      }
    );

    workerRegistry.register('storage-gc', { concurrency: 1 });

    gcWorker.on('completed', () => workerRegistry.recordCompleted('storage-gc'));
    gcWorker.on('error', () => workerRegistry.markDegraded('storage-gc'));
    gcWorker.on('failed', (job, error) => {
      workerRegistry.recordFailed('storage-gc');
      logger.error(`Storage GC job ${job?.id} failed: ${error.message}`);
      // GC jobs are typically not retried via DLQ due to their scheduled nature
    });

    gcWorker.on('completed', (job) => {
      logger.info(`Storage GC job ${job.id} completed successfully`);
    });
  }

  return { pinWorker, gcWorker };
};

export const stopStorageWorkers = async (): Promise<void> => {
  if (pinWorker) {
    await pinWorker.close();
    pinWorker = null;
    workerRegistry.markStopped('storage-pin');
  }

  if (gcWorker) {
    await gcWorker.close();
    gcWorker = null;
    workerRegistry.markStopped('storage-gc');
  }
};

export const scheduleStorageGc = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  await storageGcQueue.add(
    'gc' as any,
    { retentionDays },
    {
      repeat: { pattern: '0 */6 * * *' },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
};

/**
 * Replay a storage job from the DLQ back to the storage pin queue.
 */
export const replayStorageJob = async (
  jobData: StoragePinJobData,
  options?: {
    delay?: number;
    priority?: number;
  }
): Promise<{ success: boolean; jobId?: string | number; error?: string }> => {
  try {
    if (process.env.NODE_ENV === 'test') {
      return { success: true, jobId: 'test-replay-job' };
    }

    const { storagePinQueue } = await import('./queue.js');
    
    const job = await storagePinQueue.add(
      jobData.mode === 'json' ? 'pin-json' : 'pin-file' as any,
      jobData,
      {
        delay: options?.delay || 0,
        priority: options?.priority || 0,
        // Reset attempts for replayed jobs
        attempts: Number(process.env.STORAGE_MAX_PIN_ATTEMPTS || '5')
      }
    );

    logger.info(`Replayed storage job for ${jobData.resourceType}/${jobData.resourceId}/${jobData.name}`);
    
    return { success: true, jobId: job.id ?? '' };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown replay error';
    logger.error(`Failed to replay storage job for ${jobData.resourceType}/${jobData.resourceId}:`, errorMessage);
    
    return { success: false, error: errorMessage };
  }
};

/**
 * Get storage worker health and status information.
 */
export const getStorageWorkerHealth = async (): Promise<{
  pinWorker: { active: boolean; status: string };
  gcWorker: { active: boolean; status: string };
  queues: {
    pinQueue: { waiting: number; active: number; completed: number; failed: number };
    gcQueue: { waiting: number; active: number; completed: number; failed: number };
  };
}> => {
  try {
    const health = {
      pinWorker: {
        active: pinWorker !== null,
        status: pinWorker ? 'running' : 'stopped'
      },
      gcWorker: {
        active: gcWorker !== null,
        status: gcWorker ? 'running' : 'stopped'
      },
      queues: {
        pinQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        gcQueue: { waiting: 0, active: 0, completed: 0, failed: 0 }
      }
    };

    if (process.env.NODE_ENV !== 'test') {
      const { storagePinQueue, storageGcQueue } = await import('./queue.js');
      
      const pinQueueCounts = await storagePinQueue.getJobCounts();
      const gcQueueCounts = await storageGcQueue.getJobCounts();
      
      health.queues.pinQueue = {
        waiting: pinQueueCounts.waiting || 0,
        active: pinQueueCounts.active || 0,
        completed: pinQueueCounts.completed || 0,
        failed: pinQueueCounts.failed || 0
      };
      
      health.queues.gcQueue = {
        waiting: gcQueueCounts.waiting || 0,
        active: gcQueueCounts.active || 0,
        completed: gcQueueCounts.completed || 0,
        failed: gcQueueCounts.failed || 0
      };
    }

    return health;
  } catch (error) {
    logger.error('Failed to get storage worker health:', error);
    throw error;
  }
};

/**
 * Pause storage workers (for maintenance or troubleshooting).
 */
export const pauseStorageWorkers = async (): Promise<void> => {
  if (pinWorker) {
    await pinWorker.pause();
    logger.info('Storage pin worker paused');
  }
  
  if (gcWorker) {
    await gcWorker.pause();
    logger.info('Storage GC worker paused');
  }
};

/**
 * Resume storage workers after pause.
 */
export const resumeStorageWorkers = async (): Promise<void> => {
  if (pinWorker) {
    pinWorker.resume();
    logger.info('Storage pin worker resumed');
  }
  
  if (gcWorker) {
    gcWorker.resume();
    logger.info('Storage GC worker resumed');
  }
};
