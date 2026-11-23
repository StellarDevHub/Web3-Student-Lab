-- AlterTable: Add GitHub OAuth fields to students table
ALTER TABLE "students" ADD COLUMN "githubId" INTEGER;
ALTER TABLE "students" ADD COLUMN "githubUsername" TEXT;
ALTER TABLE "students" ADD COLUMN "githubAvatarUrl" TEXT;
ALTER TABLE "students" ADD COLUMN "githubAccessToken" TEXT;

-- CreateIndex for githubId
CREATE UNIQUE INDEX "students_githubId_key" ON "students"("githubId");
CREATE INDEX "students_githubId_idx" ON "students"("githubId");

-- CreateTable: OAuthState for CSRF state management
CREATE TABLE "oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'github',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for OAuthState
CREATE UNIQUE INDEX "oauth_states_state_key" ON "oauth_states"("state");
CREATE INDEX "oauth_states_state_idx" ON "oauth_states"("state");
CREATE INDEX "oauth_states_expiresAt_idx" ON "oauth_states"("expiresAt");
