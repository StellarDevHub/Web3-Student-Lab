-- Phase 4: CONTRACT (#1426 / BE-HARD-35)
-- Run ONLY after every writer has moved to the new column.
DROP TRIGGER IF EXISTS "trg_sync_students_githubhandle" ON "students";
DROP FUNCTION IF EXISTS "sync_students_githubhandle"();
ALTER TABLE "students" DROP COLUMN IF EXISTS "githubUsername";
CREATE OR REPLACE VIEW "students_compat" AS SELECT * FROM "students";
