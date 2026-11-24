-- BE-011: immutable IPFS/Filecoin pins
CREATE TABLE "pinned_assets" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "filecoinProvider" TEXT,
    "filecoinCid" TEXT,
    "filecoinStatus" TEXT NOT NULL DEFAULT 'pending',
    "cdnUrl" TEXT NOT NULL,
    "gatewayVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedGateway" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "pinLatencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pinned_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pinned_assets_resourceType_resourceId_kind_key" ON "pinned_assets"("resourceType", "resourceId", "kind");
CREATE INDEX "pinned_assets_cid_idx" ON "pinned_assets"("cid");

-- A pinned CID is content-addressed and must never be rewritten.
CREATE OR REPLACE FUNCTION pinned_assets_immutable_cid() RETURNS trigger AS $$
BEGIN
    IF NEW."cid" <> OLD."cid" OR NEW."sha256" <> OLD."sha256" THEN
        RAISE EXCEPTION 'pinned_assets.cid is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "pinned_assets_immutable_cid"
    BEFORE UPDATE ON "pinned_assets"
    FOR EACH ROW EXECUTE FUNCTION pinned_assets_immutable_cid();

-- BE-009: tamper-evident audit hash chain
CREATE TABLE "audit_chain_entries" (
    "sequence" BIGINT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "entryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_chain_entries_pkey" PRIMARY KEY ("sequence")
);

CREATE UNIQUE INDEX "audit_chain_entries_entryHash_key" ON "audit_chain_entries"("entryHash");
CREATE INDEX "audit_chain_entries_createdAt_idx" ON "audit_chain_entries"("createdAt");

-- Defence in depth: the application never updates or deletes chain rows.
-- (A privileged attacker can drop this trigger; the hash chain and the
-- Stellar-anchored Merkle roots still expose any change they make.)
CREATE OR REPLACE FUNCTION audit_chain_entries_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_chain_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_chain_entries_append_only"
    BEFORE UPDATE OR DELETE ON "audit_chain_entries"
    FOR EACH ROW EXECUTE FUNCTION audit_chain_entries_append_only();

CREATE TABLE "audit_chain_anchors" (
    "id" TEXT NOT NULL,
    "fromSequence" BIGINT NOT NULL,
    "toSequence" BIGINT NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "headHash" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anchoredAt" TIMESTAMP(3),

    CONSTRAINT "audit_chain_anchors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_chain_anchors_toSequence_idx" ON "audit_chain_anchors"("toSequence");
CREATE INDEX "audit_chain_anchors_status_idx" ON "audit_chain_anchors"("status");
