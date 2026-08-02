import type { StorageAssetRecord } from './types.js';

const getPrisma = async () => {
  const module = await import('../../db/index.js');
  return module.default;
};

export const upsertStorageAsset = async (asset: {
  resourceType: string;
  resourceId: string;
  name: string;
  kind: string;
  provider: string;
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  status?: string;
  referenceCount?: number;
  metadata?: Record<string, unknown> | null;
  error?: string | null;
}): Promise<StorageAssetRecord> => {
  const prisma = await getPrisma();
  return prisma.decentralizedAsset.upsert({
    where: {
      workspaceId_resourceType_resourceId_name: {
        workspaceId: 'default',
        resourceType: asset.resourceType,
        resourceId: asset.resourceId,
        name: asset.name,
      },
    },
    update: {
      kind: asset.kind,
      provider: asset.provider,
      cid: asset.cid,
      ipfsUri: asset.ipfsUri,
      gatewayUrl: asset.gatewayUrl,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.sizeBytes ?? null,
      status: asset.status ?? 'pinned',
      referenceCount: asset.referenceCount ?? 1,
      metadata: asset.metadata ?? null,
      error: asset.error ?? null,
      pinnedAt: asset.status === 'pinned' ? new Date() : undefined,
      unpinnedAt: null,
    },
    create: {
      resourceType: asset.resourceType,
      resourceId: asset.resourceId,
      name: asset.name,
      kind: asset.kind,
      provider: asset.provider,
      cid: asset.cid,
      ipfsUri: asset.ipfsUri,
      gatewayUrl: asset.gatewayUrl,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.sizeBytes ?? null,
      status: asset.status ?? 'pinned',
      referenceCount: asset.referenceCount ?? 1,
      metadata: asset.metadata ?? null,
      error: asset.error ?? null,
      pinnedAt: asset.status === 'pinned' ? new Date() : null,
    },
  });
};

export const markAssetFailed = async (
  resourceType: string,
  resourceId: string,
  name: string,
  error: string
): Promise<void> => {
  const prisma = await getPrisma();
  await prisma.decentralizedAsset.upsert({
    where: {
      workspaceId_resourceType_resourceId_name: {
        workspaceId: 'default',
        resourceType,
        resourceId,
        name,
      },
    },
    update: {
      status: 'failed',
      error,
    },
    create: {
      resourceType,
      resourceId,
      name,
      kind: 'generic',
      provider: process.env.DECENTRALIZED_STORAGE_PROVIDER || 'pinata',
      cid: 'pending',
      ipfsUri: 'ipfs://pending',
      gatewayUrl: '',
      status: 'failed',
      error,
    },
  });
};

export const listUnreferencedAssets = async (olderThan: Date): Promise<StorageAssetRecord[]> => {
  const prisma = await getPrisma();
  return prisma.decentralizedAsset.findMany({
    where: {
      referenceCount: { lte: 0 },
      OR: [{ unpinnedAt: null }, { unpinnedAt: { lt: olderThan } }],
      status: { in: ['pinned', 'failed', 'unreferenced'] },
    },
  });
};

export const markAssetUnpinned = async (cid: string): Promise<void> => {
  const prisma = await getPrisma();
  await prisma.decentralizedAsset.updateMany({
    where: { cid },
    data: {
      status: 'unpinned',
      unpinnedAt: new Date(),
      referenceCount: 0,
    },
  });
};

export const markAssetsUnreferenced = async (
  resourceType: string,
  resourceId: string
): Promise<void> => {
  const prisma = await getPrisma();
  await prisma.decentralizedAsset.updateMany({
    where: {
      resourceType,
      resourceId,
      status: { in: ['queued', 'failed', 'pinned'] },
    },
    data: {
      referenceCount: 0,
      status: 'unreferenced',
    },
  });
};
