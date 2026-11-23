-- Phase 3: BACKWARDS-COMPATIBLE VIEW (#1426 / BE-HARD-35)
-- Old readers keep working by selecting the resolved value under a stable name.
CREATE OR REPLACE VIEW "students_compat" AS
SELECT *, COALESCE("githubHandle", "githubUsername") AS "githubHandle_resolved"
FROM "students";
