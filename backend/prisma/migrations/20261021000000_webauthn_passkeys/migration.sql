-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "algorithm" INTEGER NOT NULL,
    "signCount" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aaguid" TEXT,
    "attestationFormat" TEXT NOT NULL,
    "attestationType" TEXT NOT NULL,
    "userVerified" BOOLEAN NOT NULL DEFAULT false,
    "backupEligible" BOOLEAN NOT NULL DEFAULT false,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "deviceName" TEXT,
    "cloneDetectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "ceremony" TEXT NOT NULL,
    "studentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credentialId_key" ON "webauthn_credentials"("credentialId");

-- CreateIndex
CREATE INDEX "webauthn_credentials_studentId_idx" ON "webauthn_credentials"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_challenges_challenge_key" ON "webauthn_challenges"("challenge");

-- CreateIndex
CREATE INDEX "webauthn_challenges_expiresAt_idx" ON "webauthn_challenges"("expiresAt");

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

