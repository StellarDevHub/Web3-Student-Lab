-- AlterTable
ALTER TABLE "analytics_data" ALTER COLUMN "value" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "learning_progress" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE IF NOT EXISTS "passkey_credentials" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKeyX" TEXT NOT NULL,
    "publicKeyY" TEXT NOT NULL,
    "signCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "student_activities" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "vesting_schedules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "projectId" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "cliffMonths" INTEGER NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "claimedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vesting_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ideas" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "votes" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "hash_simulations" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "inputData" TEXT NOT NULL,
    "hashType" TEXT NOT NULL,
    "hashValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hash_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "p2p_nodes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "nodeId" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "ipAddress" TEXT,
    "port" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p2p_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "p2p_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p2p_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "contributor_proofs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "did" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "githubHandle" TEXT NOT NULL,
    "proofHash" TEXT NOT NULL,
    "documentId" TEXT,
    "versionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributor_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceXLM" DOUBLE PRECISION NOT NULL,
    "billingPeriodDays" INTEGER NOT NULL DEFAULT 30,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_records" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountXLM" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "passkey_credentials_credentialId_key" ON "passkey_credentials"("credentialId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "passkey_credentials_userId_idx" ON "passkey_credentials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_subscriptions_workspaceId_url_key" ON "webhook_subscriptions"("workspaceId", "url");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "vesting_schedules_projectId_key" ON "vesting_schedules"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "vesting_schedules_projectId_idx" ON "vesting_schedules"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ideas_workspaceId_idx" ON "ideas"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ideas_studentId_idx" ON "ideas"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "votes_ideaId_studentId_key" ON "votes"("ideaId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hash_simulations_studentId_idx" ON "hash_simulations"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "p2p_nodes_nodeId_key" ON "p2p_nodes"("nodeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "p2p_nodes_workspaceId_idx" ON "p2p_nodes"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "p2p_messages_senderId_idx" ON "p2p_messages"("senderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "p2p_messages_receiverId_idx" ON "p2p_messages"("receiverId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contributor_proofs_proofHash_key" ON "contributor_proofs"("proofHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contributor_proofs_did_idx" ON "contributor_proofs"("did");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contributor_proofs_proofHash_idx" ON "contributor_proofs"("proofHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contributor_proofs_workspaceId_createdAt_idx" ON "contributor_proofs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_studentId_idx" ON "subscriptions"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_planId_idx" ON "subscriptions"("planId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_records_subscriptionId_idx" ON "payment_records"("subscriptionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "certificates_studentId_status_idx" ON "certificates"("studentId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "certificates_courseId_issuedAt_idx" ON "certificates"("courseId", "issuedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "courses_workspaceId_title_idx" ON "courses"("workspaceId", "title");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "enrollments_studentId_idx" ON "enrollments"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "enrollments_courseId_idx" ON "enrollments"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "learning_progress_studentId_idx" ON "learning_progress"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "learning_progress_courseId_idx" ON "learning_progress"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "learning_progress_status_idx" ON "learning_progress"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "learning_progress_lastAccessedAt_idx" ON "learning_progress"("lastAccessedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "students_workspaceId_email_idx" ON "students"("workspaceId", "email");

-- AddForeignKey
ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hash_simulations" ADD CONSTRAINT "hash_simulations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_messages" ADD CONSTRAINT "p2p_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "p2p_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_messages" ADD CONSTRAINT "p2p_messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "p2p_nodes"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
