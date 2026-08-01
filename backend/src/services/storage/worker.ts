import { Job, Worker } from 'bullmq';
import logger from '../../utils/logger.js';
import * as defaultRepository from './asset.repository.js';
import { createStorageProvider } from './provider.js';
import { STORAGE_GC_QUEUE_NAME, STORAGE_PIN_QUEUE_NAME, storageGcQueue } from './queue.js';
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
            metadata: payload.metadata,
          })
        : await activeProvider.pinFile({
            content: Buffer.from(payload.content as string, 'base64'),
            filename: payload.filename || payload.name,
            mimeType: payload.mimeType || 'application/octet-stream',
            metadata: payload.metadata,
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
    pinWorker = new Worker(STORAGE_PIN_QUEUE_NAME, pinStorageContent, {
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

    pinWorker.on('failed', (job, error) => {
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

    gcWorker.on('failed', (job, error) => {
      logger.error(`Storage GC job ${job?.id} failed: ${error.message}`);
    });
  }

  return { pinWorker, gcWorker };
};

export const stopStorageWorkers = async (): Promise<void> => {
  if (pinWorker) {
    await pinWorker.close();
    pinWorker = null;
  }

  if (gcWorker) {
    await gcWorker.close();
    gcWorker = null;
  }
};

export const scheduleStorageGc = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  await storageGcQueue.add(
    'gc',
    { retentionDays },
    {
      repeat: { pattern: '0 */6 * * *' },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
};
