-- Instant ZERO-DOWNTIME ROLLBACK (#1426 / BE-HARD-35)
-- Reverses expand + dual-write without touching the legacy column or its data.
-- Because "githubUsername" was never dropped, rolling back is a metadata-only
-- operation and old code resumes working immediately.
DROP TRIGGER IF EXISTS "trg_sync_students_githubhandle" ON "students";
DROP FUNCTION IF EXISTS "sync_students_githubhandle"();
ALTER TABLE "students" DROP COLUMN IF EXISTS "githubHandle";
CREATE OR REPLACE VIEW "students_compat" AS
SELECT *, "githubUsername" AS "githubHandle_resolved" FROM "students";
