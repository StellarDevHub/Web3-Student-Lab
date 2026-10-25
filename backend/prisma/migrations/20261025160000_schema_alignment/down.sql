-- DropForeignKey
ALTER TABLE IF EXISTS "payment_records" DROP CONSTRAINT IF EXISTS "payment_records_subscriptionId_fkey";
ALTER TABLE IF EXISTS "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_planId_fkey";
ALTER TABLE IF EXISTS "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_studentId_fkey";
ALTER TABLE IF EXISTS "p2p_messages" DROP CONSTRAINT IF EXISTS "p2p_messages_receiverId_fkey";
ALTER TABLE IF EXISTS "p2p_messages" DROP CONSTRAINT IF EXISTS "p2p_messages_senderId_fkey";
ALTER TABLE IF EXISTS "hash_simulations" DROP CONSTRAINT IF EXISTS "hash_simulations_studentId_fkey";
ALTER TABLE IF EXISTS "votes" DROP CONSTRAINT IF EXISTS "votes_studentId_fkey";
ALTER TABLE IF EXISTS "votes" DROP CONSTRAINT IF EXISTS "votes_ideaId_fkey";
ALTER TABLE IF EXISTS "ideas" DROP CONSTRAINT IF EXISTS "ideas_studentId_fkey";
ALTER TABLE IF EXISTS "passkey_credentials" DROP CONSTRAINT IF EXISTS "passkey_credentials_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "payment_records" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "subscription_plans" CASCADE;
DROP TABLE IF EXISTS "contributor_proofs" CASCADE;
DROP TABLE IF EXISTS "p2p_messages" CASCADE;
DROP TABLE IF EXISTS "p2p_nodes" CASCADE;
DROP TABLE IF EXISTS "hash_simulations" CASCADE;
DROP TABLE IF EXISTS "votes" CASCADE;
DROP TABLE IF EXISTS "ideas" CASCADE;
DROP TABLE IF EXISTS "vesting_schedules" CASCADE;
DROP TABLE IF EXISTS "student_activities" CASCADE;
DROP TABLE IF EXISTS "webhook_subscriptions" CASCADE;
DROP TABLE IF EXISTS "passkey_credentials" CASCADE;

-- DropIndex
DROP INDEX IF EXISTS "students_workspaceId_email_idx";
DROP INDEX IF EXISTS "learning_progress_lastAccessedAt_idx";
DROP INDEX IF EXISTS "learning_progress_status_idx";
DROP INDEX IF EXISTS "learning_progress_courseId_idx";
DROP INDEX IF EXISTS "learning_progress_studentId_idx";
DROP INDEX IF EXISTS "enrollments_status_idx";
DROP INDEX IF EXISTS "enrollments_courseId_idx";
DROP INDEX IF EXISTS "enrollments_studentId_idx";
DROP INDEX IF EXISTS "courses_workspaceId_title_idx";
DROP INDEX IF EXISTS "certificates_courseId_issuedAt_idx";
DROP INDEX IF EXISTS "certificates_studentId_status_idx";

-- AlterTable
ALTER TABLE IF EXISTS "students" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE IF EXISTS "learning_progress" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE IF EXISTS "feedback" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE IF EXISTS "enrollments" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE IF EXISTS "courses" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE IF EXISTS "certificates" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE IF EXISTS "canvases" DROP COLUMN IF EXISTS "workspaceId";
ALTER TABLE IF EXISTS "audit_logs" DROP COLUMN IF EXISTS "workspaceId";

