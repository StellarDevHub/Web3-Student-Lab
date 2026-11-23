# Database Migrations

## Creating a migration

```bash
cd backend
npx prisma migrate dev --name <descriptive_name>
```

This applies the migration to your local dev database and generates
`prisma/migrations/<timestamp>_<name>/migration.sql`. Review the generated
SQL before committing it — Prisma's diff is usually right, but it can't know
your intent for a rename vs. a drop-and-recreate.

## Verifying a migration locally (matches CI exactly)

CI runs three checks against a real PostgreSQL instance, in this order.
Reproduce all three locally before opening a PR that touches
`prisma/schema.prisma` or `prisma/migrations/`:

```bash
cd backend

# 1. Migrations must apply cleanly to a fresh database.
export DATABASE_URL=postgresql://<user>@localhost:5432/<scratch_db>
npx prisma generate
npx prisma migrate deploy

# 2. The latest migration must be safely reversible (rollback verification).
#    Needs a second, empty "shadow" database.
export SHADOW_DATABASE_URL=postgresql://<user>@localhost:5432/<scratch_shadow_db>
npm run test:migrations

# 3. schema.prisma must not have drifted from the migration history.
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
```

Step 3 currently reports a large amount of pre-existing drift (dozens of
tables/columns present in `schema.prisma` with no corresponding migration —
see the PR that added this doc for the full list). CI runs this step with
`continue-on-error: true` for now rather than blocking every PR on
resolving that backlog; **once it's cleared with a dedicated migration**,
remove `continue-on-error` from `.github/workflows/ci.yml` so future drift
fails CI as intended. Don't let *new* drift accumulate on top of the
existing gap in the meantime — if step 3 reports differences you
introduced, generate a migration for them before merging.

## What "rollback verification" actually checks

`scripts/test-migration-rollback.sh`:
1. Diffs the latest migration against the migration history without it,
   generating a `DOWN` SQL script.
2. Applies all migrations (including the latest) to a scratch database.
3. Executes the generated `DOWN` script.
4. Diffs the now-rolled-back database against the pre-latest-migration
   schema state — a clean diff means the rollback is exact.

This catches migrations that are irreversible in practice (e.g. a
`DROP COLUMN` with no default that would lose data on a real rollback) or
whose generated `DOWN` script doesn't fully undo the `UP` script.

## Prerequisites

Both `DATABASE_URL` and `SHADOW_DATABASE_URL` must point at databases on the
**same** Postgres server/role — only the database name differs. Neither
script requires network access beyond that Postgres instance.
