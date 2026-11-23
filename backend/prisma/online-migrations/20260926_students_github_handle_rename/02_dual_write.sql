-- Phase 2: DUAL-WRITE (#1426 / BE-HARD-35)
-- Keep the legacy and new columns in sync while both app versions write.
CREATE OR REPLACE FUNCTION "sync_students_githubhandle"() RETURNS trigger AS $$
BEGIN
  IF NEW."githubHandle" IS NULL AND NEW."githubUsername" IS NOT NULL THEN
    NEW."githubHandle" := NEW."githubUsername";
  END IF;
  IF NEW."githubUsername" IS NULL AND NEW."githubHandle" IS NOT NULL THEN
    NEW."githubUsername" := NEW."githubHandle";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_sync_students_githubhandle" ON "students";
CREATE TRIGGER "trg_sync_students_githubhandle" BEFORE INSERT OR UPDATE ON "students"
  FOR EACH ROW EXECUTE FUNCTION "sync_students_githubhandle"();
