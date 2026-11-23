-- CreateTable: ProcessedBlock and BridgeEvent for the cross-chain bridge indexer
CREATE TABLE "processed_blocks" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "parentHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRolledBack" BOOLEAN NOT NULL DEFAULT false,
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "processed_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bridge_events" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "processedBlockId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceChain" TEXT NOT NULL,
    "targetChain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "transactionHash" TEXT,
    "logIndex" INTEGER,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "bridge_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_blocks_blockHash_key" ON "processed_blocks"("blockHash");
CREATE INDEX "processed_blocks_chain_blockNumber_idx" ON "processed_blocks"("chain", "blockNumber");
CREATE UNIQUE INDEX "bridge_events_chain_eventId_key" ON "bridge_events"("chain", "eventId");
CREATE INDEX "bridge_events_processedBlockId_idx" ON "bridge_events"("processedBlockId");

-- AddForeignKey
ALTER TABLE "bridge_events" ADD CONSTRAINT "bridge_events_processedBlockId_fkey" FOREIGN KEY ("processedBlockId") REFERENCES "processed_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
