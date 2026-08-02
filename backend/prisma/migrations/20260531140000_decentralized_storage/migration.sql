-- CreateTable
CREATE TABLE "decentralized_assets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'pinata',
    "cid" TEXT NOT NULL,
    "ipfsUri" TEXT NOT NULL,
    "gatewayUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "referenceCount" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "error" TEXT,
    "pinnedAt" TIMESTAMP(3),
    "unpinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decentralized_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decentralized_assets_cid_key" ON "decentralized_assets"("cid");

-- CreateIndex
CREATE UNIQUE INDEX "decentralized_assets_workspaceId_resourceType_resourceId_name_key" ON "decentralized_assets"("workspaceId", "resourceType", "resourceId", "name");

-- CreateIndex
CREATE INDEX "decentralized_assets_workspaceId_status_idx" ON "decentralized_assets"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "decentralized_assets_workspaceId_resourceType_resourceId_idx" ON "decentralized_assets"("workspaceId", "resourceType", "resourceId");
