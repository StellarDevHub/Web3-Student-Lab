import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { garbageCollectStorage, pinStorageContent } from '../src/services/storage/worker.js';
import { MockStorageProvider } from '../src/services/storage/providers/mock.provider.js';
import type { StorageWorkerDependencies } from '../src/services/storage/worker.js';

const createRepository = (): NonNullable<StorageWorkerDependencies['repository']> => ({
  upsertStorageAsset: jest.fn(),
  markAssetFailed: jest.fn(),
  listUnreferencedAssets: jest.fn(),
  markAssetUnpinned: jest.fn(),
});

describe('storage worker', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('pins JSON job payloads', async () => {
    const repository = createRepository();
    repository.upsertStorageAsset.mockResolvedValue({} as never);

    const result = await pinStorageContent(
      {
        data: {
          resourceType: 'project',
          resourceId: 'project-1',
          name: 'example',
          kind: 'generic',
          mode: 'json',
          content: { hello: 'world' },
        },
      } as never,
      {
        provider: new MockStorageProvider(),
        repository,
      }
    );

    expect(result.provider).toBe('mock');
    expect(repository.upsertStorageAsset).toHaveBeenCalledTimes(1);
  });

  it('garbage collects stale assets', async () => {
    const repository = createRepository();
    repository.listUnreferencedAssets.mockResolvedValue([
      {
        id: 'asset-1',
        resourceType: 'project',
        resourceId: 'project-1',
        name: 'example',
        kind: 'generic',
        provider: 'mock',
        cid: 'bafy123',
        ipfsUri: 'ipfs://bafy123',
        gatewayUrl: 'https://gateway.pinata.cloud/ipfs/bafy123',
        mimeType: null,
        sizeBytes: 10,
        status: 'pinned',
        referenceCount: 0,
        metadata: null,
        error: null,
        pinnedAt: null,
        unpinnedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);
    repository.markAssetUnpinned.mockResolvedValue(undefined);

    const result = await garbageCollectStorage(
      {
        data: {
          retentionDays: 30,
          dryRun: false,
        },
      } as never,
      {
        provider: new MockStorageProvider(),
        repository,
      }
    );

    expect(result.inspected).toBe(1);
    expect(result.unpinned).toBe(1);
    expect(repository.listUnreferencedAssets).toHaveBeenCalled();
    expect(repository.markAssetUnpinned).toHaveBeenCalledWith('bafy123');
  });
});
