-- Persist privacy-minimal certificate verification events for analytics.
-- The table intentionally stores public certificate identifiers and timestamps only.
CREATE TABLE "certificate_verification_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "certificateId" TEXT,
    "tokenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_verification_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "certificate_verification_events"
ADD CONSTRAINT "certificate_verification_events_certificateId_fkey"
FOREIGN KEY ("certificateId") REFERENCES "certificates"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "certificate_verification_events_workspaceId_createdAt_idx"
ON "certificate_verification_events"("workspaceId", "createdAt");

CREATE INDEX "certificate_verification_events_certificateId_idx"
ON "certificate_verification_events"("certificateId");

CREATE INDEX "certificate_verification_events_tokenId_idx"
ON "certificate_verification_events"("tokenId");

CREATE INDEX "certificate_verification_events_createdAt_idx"
ON "certificate_verification_events"("createdAt");
