import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { StorageService, ContentIntegrityError } from '../src/services/storage/storage.service.js';
import { MockStorageProvider } from '../src/services/storage/providers/mock.provider.js';
import type { StorageServiceDependencies, ContentFetcher } from '../src/services/storage/storage.service.js';

const createRepository = (): NonNullable<StorageServiceDependencies['repository']> => ({
  upsertStorageAsset: jest.fn(),
  markAssetFailed: jest.fn(),
  listUnreferencedAssets: jest.fn(),
  markAssetUnpinned: jest.fn(),
  markAssetsUnreferenced: jest.fn(),
});

/** A fetcher that echoes back exactly what was uploaded — simulates a
 * provider correctly serving the content it was given. */
const echoJsonFetcher = (content: unknown): ContentFetcher => async () =>
  Buffer.from(JSON.stringify(content));

const echoBufferFetcher = (content: Buffer): ContentFetcher => async () => content;

describe('storage service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('pins JSON, verifies the returned CID serves back the exact content, and persists it', async () => {
    const repository = createRepository();
    repository.upsertStorageAsset.mockResolvedValue({} as never);
    const content = { hello: 'world' };

    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository,
      contentFetcher: echoJsonFetcher(content),
    });

    const result = await storageService.pinJsonNow({
      resourceType: 'project',
      resourceId: 'project-1',
      name: 'example',
      kind: 'generic',
      content,
    });

    expect(result.provider).toBe('mock');
    expect(repository.upsertStorageAsset).toHaveBeenCalledTimes(1);
    expect(repository.markAssetFailed).not.toHaveBeenCalled();
  });

  it('pins files, verifies the returned CID serves back the exact bytes, and persists it', async () => {
    const repository = createRepository();
    repository.upsertStorageAsset.mockResolvedValue({} as never);
    const content = Buffer.from('<svg />');

    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository,
      contentFetcher: echoBufferFetcher(content),
    });

    const result = await storageService.pinFileNow({
      resourceType: 'certificate',
      resourceId: 'cert-1',
      name: 'cert.svg',
      kind: 'certificate-image',
      content,
      mimeType: 'image/svg+xml',
    });

    expect(result.provider).toBe('mock');
    expect(repository.upsertStorageAsset).toHaveBeenCalledTimes(1);
    expect(repository.markAssetFailed).not.toHaveBeenCalled();
  });

  it('does not persist a JSON pin when the provider serves back different content, and marks the asset failed', async () => {
    const repository = createRepository();
    repository.upsertStorageAsset.mockResolvedValue({} as never);
    repository.markAssetFailed.mockResolvedValue(undefined as never);

    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository,
      // Simulates a corrupted/tampered response: the gateway serves back
      // content that doesn't match what was uploaded.
      contentFetcher: async () => Buffer.from(JSON.stringify({ hello: 'TAMPERED' })),
    });

    await expect(
      storageService.pinJsonNow({
        resourceType: 'project',
        resourceId: 'project-1',
        name: 'example',
        kind: 'generic',
        content: { hello: 'world' },
      })
    ).rejects.toThrow(ContentIntegrityError);

    expect(repository.upsertStorageAsset).not.toHaveBeenCalled();
    expect(repository.markAssetFailed).toHaveBeenCalledTimes(1);
    expect(repository.markAssetFailed).toHaveBeenCalledWith(
      'project',
      'project-1',
      'example',
      expect.stringContaining('Content integrity check failed')
    );
  });

  it('does not persist a file pin when the provider serves back different bytes, and marks the asset failed', async () => {
    const repository = createRepository();
    repository.upsertStorageAsset.mockResolvedValue({} as never);
    repository.markAssetFailed.mockResolvedValue(undefined as never);

    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository,
      contentFetcher: async () => Buffer.from('<svg>tampered</svg>'),
    });

    await expect(
      storageService.pinFileNow({
        resourceType: 'certificate',
        resourceId: 'cert-1',
        name: 'cert.svg',
        kind: 'certificate-image',
        content: Buffer.from('<svg />'),
        mimeType: 'image/svg+xml',
      })
    ).rejects.toThrow(ContentIntegrityError);

    expect(repository.upsertStorageAsset).not.toHaveBeenCalled();
    expect(repository.markAssetFailed).toHaveBeenCalledTimes(1);
  });

  it('marks the asset failed (and does not persist) when the provider response is not valid JSON', async () => {
    const repository = createRepository();
    repository.markAssetFailed.mockResolvedValue(undefined as never);

    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository,
      contentFetcher: async () => Buffer.from('not-json{{{'),
    });

    await expect(
      storageService.pinJsonNow({
        resourceType: 'project',
        resourceId: 'project-1',
        name: 'example',
        kind: 'generic',
        content: { hello: 'world' },
      })
    ).rejects.toThrow(ContentIntegrityError);

    expect(repository.upsertStorageAsset).not.toHaveBeenCalled();
    expect(repository.markAssetFailed).toHaveBeenCalledTimes(1);
  });

  it('marks the asset failed and rethrows when fetching the pinned content itself fails', async () => {
    const repository = createRepository();
    repository.markAssetFailed.mockResolvedValue(undefined as never);
    const fetchError = new Error('network unreachable');

    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository,
      contentFetcher: async () => {
        throw fetchError;
      },
    });

    await expect(
      storageService.pinJsonNow({
        resourceType: 'project',
        resourceId: 'project-1',
        name: 'example',
        kind: 'generic',
        content: { hello: 'world' },
      })
    ).rejects.toThrow('network unreachable');

    expect(repository.upsertStorageAsset).not.toHaveBeenCalled();
    expect(repository.markAssetFailed).toHaveBeenCalledTimes(1);
  });

  it('treats semantically-identical JSON with different key order/whitespace as matching (canonical comparison)', async () => {
    const repository = createRepository();
    repository.upsertStorageAsset.mockResolvedValue({} as never);

    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository,
      // Same data, different key order and formatting — a real provider's
      // re-serialization commonly differs this way without being corrupt.
      contentFetcher: async () => Buffer.from('{"world":"!","hello":"world"}'),
    });

    await expect(
      storageService.pinJsonNow({
        resourceType: 'project',
        resourceId: 'project-1',
        name: 'example',
        kind: 'generic',
        content: { hello: 'world', world: '!' },
      })
    ).resolves.toBeDefined();

    expect(repository.upsertStorageAsset).toHaveBeenCalledTimes(1);
    expect(repository.markAssetFailed).not.toHaveBeenCalled();
  });

  it('queues pin and gc jobs', async () => {
    const storageService = new StorageService({
      provider: new MockStorageProvider(),
      repository: createRepository(),
    });

    const jsonJob = await storageService.queueJsonPin({
      resourceType: 'project',
      resourceId: 'project-1',
      name: 'example',
      kind: 'generic',
      content: { hello: 'world' },
    });

    const fileJob = await storageService.queueFilePin({
      resourceType: 'certificate',
      resourceId: 'cert-1',
      name: 'cert.svg',
      kind: 'certificate-image',
      content: Buffer.from('hello').toString('base64'),
      mimeType: 'image/svg+xml',
    });

    const gcJob = await storageService.queueGarbageCollection(7, true);

    expect(jsonJob.jobId).toEqual(expect.any(String));
    expect(fileJob.jobId).toEqual(expect.any(String));
    expect(gcJob.jobId).toEqual(expect.any(String));
  });
});
