-- Zero-downtime expand phase (#1426 / BE-HARD-35).
--
-- Additive nullable column: in PostgreSQL this is a metadata-only operation
-- (no table rewrite, no long ACCESS EXCLUSIVE lock), so it is safe to apply
-- while the table is serving live traffic. `IF NOT EXISTS` makes it
-- re-runnable; the matching `contract`/`rollback` steps are driven by
-- scripts/expand-contract.ts.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "profileTag" TEXT;
