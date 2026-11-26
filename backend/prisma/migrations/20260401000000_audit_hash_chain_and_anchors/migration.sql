-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "prevHash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "hash" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_hash_idx" ON "audit_logs"("hash");

-- CreateTable
CREATE TABLE IF NOT EXISTS "merkle_anchors" (
    "id" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "prevMerkleRoot" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "logCount" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "contractAddress" TEXT,
    "network" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ANCHORED',
    "anchoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "merkle_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "merkle_anchors_merkleRoot_key" ON "merkle_anchors"("merkleRoot");
CREATE INDEX IF NOT EXISTS "merkle_anchors_periodStart_periodEnd_idx" ON "merkle_anchors"("periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "merkle_anchors_transactionHash_idx" ON "merkle_anchors"("transactionHash");
