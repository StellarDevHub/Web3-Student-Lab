-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "prevHash" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
