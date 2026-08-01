import { storageGcQueue, storagePinQueue } from './queue.js';
import { createStorageProvider } from './provider.js';
import { buildGatewayUrl, buildIpfsUri, canonicalizeJson, sha256Hex } from './utils.js';
import * as defaultRepository from './asset.repository.js';
import type {
  StoragePinRequest,
  StoragePinResult,
  StorageAssetKind,
  StorageProvider,
} from './types.js';

export interface StorageRepository {
  upsertStorageAsset: typeof defaultRepository.upsertStorageAsset;
  markAssetFailed: typeof defaultRepository.markAssetFailed;
  listUnreferencedAssets: typeof defaultRepository.listUnreferencedAssets;
  markAssetUnpinned: typeof defaultRepository.markAssetUnpinned;
  markAssetsUnreferenced: typeof defaultRepository.markAssetsUnreferenced;
}

/** Fetches the raw bytes stored at a gateway URL, for post-upload content
 * integrity verification (#912). */
export type ContentFetcher = (url: string) => Promise<Buffer>;

const defaultContentFetcher: ContentFetcher = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Content fetch failed with status ${response.status} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

/**
 * Thrown when the content a storage provider returns for a CID doesn't
 * match what was uploaded — the provider's response is treated as
 * untrusted until this check passes (#912).
 */
export class ContentIntegrityError extends Error {
  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
    public readonly cid: string,
    public readonly expectedDigest: string,
    public readonly actualDigest: string
  ) {
    super(
      `Content integrity check failed for ${resourceType}/${resourceId} (cid=${cid}): ` +
        `expected digest ${expectedDigest}, provider served ${actualDigest}`
    );
    this.name = 'ContentIntegrityError';
  }
}

export interface StorageServiceDependencies {
  provider?: StorageProvider;
  repository?: StorageRepository;
  pinQueue?: typeof storagePinQueue;
  gcQueue?: typeof storageGcQueue;
  contentFetcher?: ContentFetcher;
}

export class StorageService {
  private static instance: StorageService | null = null;
  private readonly provider: StorageProvider;
  private readonly repository: StorageRepository;
  private readonly pinQueue: typeof storagePinQueue;
  private readonly gcQueue: typeof storageGcQueue;
  private readonly contentFetcher: ContentFetcher;

  constructor(dependencies: StorageServiceDependencies | StorageProvider = {}) {
    if (this.isStorageProvider(dependencies)) {
      this.provider = dependencies;
      this.repository = defaultRepository;
      this.pinQueue = storagePinQueue;
      this.gcQueue = storageGcQueue;
      this.contentFetcher = defaultContentFetcher;
      return;
    }

    this.provider = dependencies.provider ?? createStorageProvider();
    this.repository = dependencies.repository ?? defaultRepository;
    this.pinQueue = dependencies.pinQueue ?? storagePinQueue;
    this.gcQueue = dependencies.gcQueue ?? storageGcQueue;
    this.contentFetcher = dependencies.contentFetcher ?? defaultContentFetcher;
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }

    return StorageService.instance;
  }

  async pinJsonNow(request: Omit<StoragePinRequest, 'mode'>): Promise<StoragePinResult> {
    const result = await this.provider.pinJson({
      content: request.content,
      name: request.name,
      metadata: request.metadata,
    });

    await this.verifyJsonIntegrity(request, result);
    await this.persistResult(request, result);
    return result;
  }

  async pinFileNow(
    request: Omit<StoragePinRequest, 'mode' | 'content'> & { content: Buffer }
  ): Promise<StoragePinResult> {
    const result = await this.provider.pinFile({
      content: request.content,
      filename: request.filename || request.name,
      mimeType: request.mimeType || 'application/octet-stream',
      metadata: request.metadata,
    });

    await this.verifyFileIntegrity(request, result);
    await this.persistResult(request, result);
    return result;
  }

  /**
   * Verifies a JSON pin's returned CID actually serves back the content we
   * uploaded (#912). Compares canonicalized-JSON digests (not raw bytes)
   * so differing whitespace/key-order between what we sent and what the
   * provider re-serializes doesn't produce a false-positive mismatch.
   * On mismatch, marks the asset failed and throws — the caller must not
   * treat the pin as successful or persist it as 'pinned'.
   */
  private async verifyJsonIntegrity(
    request: Omit<StoragePinRequest, 'mode'>,
    result: StoragePinResult
  ): Promise<void> {
    const expectedDigest = sha256Hex(canonicalizeJson(request.content));

    let fetched: Buffer;
    try {
      fetched = await this.contentFetcher(result.gatewayUrl);
    } catch (error) {
      await this.repository.markAssetFailed(
        request.resourceType,
        request.resourceId,
        request.name,
        `Content integrity check could not fetch pinned content: ${(error as Error).message}`
      );
      throw error;
    }

    let actualDigest: string;
    try {
      actualDigest = sha256Hex(canonicalizeJson(JSON.parse(fetched.toString('utf-8'))));
    } catch (error) {
      await this.repository.markAssetFailed(
        request.resourceType,
        request.resourceId,
        request.name,
        `Content integrity check: provider response was not valid JSON: ${(error as Error).message}`
      );
      throw new ContentIntegrityError(
        request.resourceType,
        request.resourceId,
        result.cid,
        expectedDigest,
        'invalid-json'
      );
    }

    if (actualDigest !== expectedDigest) {
      await this.repository.markAssetFailed(
        request.resourceType,
        request.resourceId,
        request.name,
        `Content integrity check failed: expected ${expectedDigest}, got ${actualDigest}`
      );
      throw new ContentIntegrityError(
        request.resourceType,
        request.resourceId,
        result.cid,
        expectedDigest,
        actualDigest
      );
    }
  }

  /**
   * Verifies a file pin's returned CID actually serves back the exact
   * bytes we uploaded (#912). Unlike JSON, file content is opaque, so this
   * compares raw-byte digests directly rather than a semantic comparison.
   */
  private async verifyFileIntegrity(
    request: Omit<StoragePinRequest, 'mode' | 'content'> & { content: Buffer },
    result: StoragePinResult
  ): Promise<void> {
    const expectedDigest = sha256Hex(request.content);

    let fetched: Buffer;
    try {
      fetched = await this.contentFetcher(result.gatewayUrl);
    } catch (error) {
      await this.repository.markAssetFailed(
        request.resourceType,
        request.resourceId,
        request.name,
        `Content integrity check could not fetch pinned content: ${(error as Error).message}`
      );
      throw error;
    }

    const actualDigest = sha256Hex(fetched);

    if (actualDigest !== expectedDigest) {
      await this.repository.markAssetFailed(
        request.resourceType,
        request.resourceId,
        request.name,
        `Content integrity check failed: expected ${expectedDigest}, got ${actualDigest}`
      );
      throw new ContentIntegrityError(
        request.resourceType,
        request.resourceId,
        result.cid,
        expectedDigest,
        actualDigest
      );
    }
  }

  async queueJsonPin(request: Omit<StoragePinRequest, 'mode'>): Promise<{ jobId?: string | number }> {
    const job = await this.pinQueue.add('pin-json', {
      ...request,
      mode: 'json',
    });
    return { jobId: job.id };
  }

  async queueFilePin(
    request: Omit<StoragePinRequest, 'mode' | 'content'> & { content: string }
  ): Promise<{ jobId?: string | number }> {
    const job = await this.pinQueue.add('pin-file', {
      ...request,
      mode: 'file',
      content: request.content,
    });
    return { jobId: job.id };
  }

  async queueGarbageCollection(retentionDays: number, dryRun = false): Promise<{ jobId?: string | number }> {
    const job = await this.gcQueue.add('gc', {
      retentionDays,
      dryRun,
    });
    return { jobId: job.id };
  }

  async releaseResource(resourceType: string, resourceId: string): Promise<void> {
    await this.repository.markAssetsUnreferenced(resourceType, resourceId);
  }

  async pinCertificateImage(request: {
    certificateId: string;
    content: Buffer;
    mimeType?: string;
  }): Promise<StoragePinResult> {
    return this.pinFileNow({
      resourceType: 'certificate',
      resourceId: request.certificateId,
      name: `certificate-image-${request.certificateId}`,
      kind: 'certificate-image',
      content: request.content,
      filename: `${request.certificateId}.svg`,
      mimeType: request.mimeType || 'image/svg+xml',
      metadata: {
        certificateId: request.certificateId,
        assetType: 'certificate-image',
      },
    });
  }

  async pinCertificateMetadata(request: {
    certificateId: string;
    content: unknown;
  }): Promise<StoragePinResult> {
    return this.pinJsonNow({
      resourceType: 'certificate',
      resourceId: request.certificateId,
      name: `certificate-metadata-${request.certificateId}`,
      kind: 'certificate-metadata',
      content: request.content,
      metadata: {
        certificateId: request.certificateId,
        assetType: 'certificate-metadata',
      },
    });
  }

  async pinProjectIdea(request: {
    projectId: string;
    content: unknown;
    queued?: boolean;
  }): Promise<StoragePinResult | { jobId?: string | number }> {
    if (request.queued) {
      return this.queueJsonPin({
        resourceType: 'project',
        resourceId: request.projectId,
        name: `project-idea-${request.projectId}`,
        kind: 'project-idea',
        content: request.content,
        metadata: {
          projectId: request.projectId,
          assetType: 'project-idea',
        },
      });
    }

    return this.pinJsonNow({
      resourceType: 'project',
      resourceId: request.projectId,
      name: `project-idea-${request.projectId}`,
      kind: 'project-idea',
      content: request.content,
      metadata: {
        projectId: request.projectId,
        assetType: 'project-idea',
      },
    });
  }

  private async persistResult(
    request: Omit<StoragePinRequest, 'mode'> & { content?: unknown },
    result: StoragePinResult
  ): Promise<void> {
    await this.repository.upsertStorageAsset({
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      name: request.name,
      kind: request.kind,
      provider: result.provider,
      cid: result.cid,
      ipfsUri: result.ipfsUri || buildIpfsUri(result.cid),
      gatewayUrl: result.gatewayUrl || buildGatewayUrl(result.cid),
      mimeType: request.mimeType ?? null,
      sizeBytes: result.sizeBytes ?? null,
      status: 'pinned',
      referenceCount: request.referenceCount ?? 1,
      metadata: request.metadata ?? null,
    });
  }

  private isStorageProvider(value: StorageServiceDependencies | StorageProvider): value is StorageProvider {
    return (
      typeof value === 'object' &&
      value !== null &&
      'pinJson' in value &&
      'pinFile' in value &&
      'unpin' in value
    );
  }
}

export const storageService = StorageService.getInstance();
