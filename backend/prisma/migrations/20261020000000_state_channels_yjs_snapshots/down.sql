-- DropForeignKey
ALTER TABLE "state_channel_updates" DROP CONSTRAINT "state_channel_updates_channelId_fkey";

-- DropTable
DROP TABLE "state_channel_updates";

-- DropTable
DROP TABLE "state_channels";

-- DropTable
DROP TABLE "yjs_document_snapshots";
