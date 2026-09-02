export type StorageProviderName = 'pinata' | 'web3.storage' | 'mock';

export type StorageAssetKind = 'certificate-image' | 'certificate-metadata' | 'project-idea' | 'generic';

export type StoragePinMode = 'json' | 'file';

export interface StoragePinRequest {
  resourceType: string;
  resourceId: string;
  name: string;
  kind: StorageAssetKind;
  mode: StoragePinMode;
  content: unknown;
  filename?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  referenceCount?: number;
}

export interface StoragePinResult {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  provider: StorageProviderName;
  sizeBytes?: number;
  isDuplicate?: boolean;
}

export interface StorageAssetRecord {
  id: string;
  resourceType: string;
  resourceId: string;
  name: string;
  kind: StorageAssetKind;
  provider: StorageProviderName;
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  referenceCount: number;
  metadata: Record<string, unknown> | null;
  error: string | null;
  pinnedAt: Date | null;
  unpinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageProvider {
  readonly name: StorageProviderName;
  pinJson(input: {
    content: unknown;
    name: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoragePinResult>;
  pinFile(input: {
    content: Buffer;
    filename: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoragePinResult>;
  unpin(cid: string): Promise<void>;
}

export interface StoragePinJobData extends StoragePinRequest {
  pinnedBy?: string;
}

export interface StorageGcJobData {
  retentionDays: number;
  dryRun?: boolean;
}

