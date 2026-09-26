-- Phase 1: EXPAND (#1426 / BE-HARD-35)
-- Additive nullable column only — metadata-only, no table rewrite, no long lock.
-- Safe to run against live traffic. `IF NOT EXISTS` makes it re-runnable.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "githubHandle" TEXT;
