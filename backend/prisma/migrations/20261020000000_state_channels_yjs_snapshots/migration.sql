-- CreateTable
CREATE TABLE "state_channels" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "studentPublicKey" TEXT NOT NULL,
    "mentorPublicKey" TEXT NOT NULL,
    "rewardStroops" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_funding',
    "latestSequence" INTEGER NOT NULL DEFAULT 0,
    "latestState" JSONB,
    "latestStudentSig" TEXT,
    "latestMentorSig" TEXT,
    "fundingTxHash" TEXT,
    "settlementTxHash" TEXT,
    "disputeInitiator" TEXT,
    "disputeDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_channel_updates" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stateHash" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "studentSig" TEXT NOT NULL,
    "mentorSig" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_channel_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yjs_document_snapshots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "stateVector" BYTEA NOT NULL,
    "lastStreamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yjs_document_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "state_channels_status_disputeDeadline_idx" ON "state_channels"("status", "disputeDeadline");

-- CreateIndex
CREATE INDEX "state_channels_studentPublicKey_idx" ON "state_channels"("studentPublicKey");

-- CreateIndex
CREATE INDEX "state_channels_mentorPublicKey_idx" ON "state_channels"("mentorPublicKey");

-- CreateIndex
CREATE UNIQUE INDEX "state_channel_updates_channelId_sequence_key" ON "state_channel_updates"("channelId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "yjs_document_snapshots_name_key" ON "yjs_document_snapshots"("name");

-- AddForeignKey
ALTER TABLE "state_channel_updates" ADD CONSTRAINT "state_channel_updates_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "state_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
