import { buildGatewayUrl, buildIpfsUri, canonicalizeJson, createDeterministicCid } from '../utils.js';
import type { StoragePinResult, StorageProvider } from '../types.js';

const buildResult = (content: string): StoragePinResult => {
  const cid = createDeterministicCid(content);

  return {
    cid,
    ipfsUri: buildIpfsUri(cid),
    gatewayUrl: buildGatewayUrl(cid),
    provider: 'mock',
    sizeBytes: Buffer.byteLength(content),
    isDuplicate: false,
  };
};

export class MockStorageProvider implements StorageProvider {
  readonly name = 'mock' as const;

  async pinJson(input: {
    content: unknown;
    name: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoragePinResult> {
    return buildResult(
      canonicalizeJson({
        name: input.name,
        metadata: input.metadata ?? {},
        content: input.content,
      })
    );
  }

  async pinFile(input: {
    content: Buffer;
    filename: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoragePinResult> {
    return buildResult(
      canonicalizeJson({
        filename: input.filename,
        mimeType: input.mimeType,
        metadata: input.metadata ?? {},
        content: input.content.toString('base64'),
      })
    );
  }

  async unpin(_cid: string): Promise<void> {
    return;
  }
}

export const createMockStorageProvider = (): StorageProvider => new MockStorageProvider();

