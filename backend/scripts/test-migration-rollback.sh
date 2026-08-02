#!/bin/bash

# Exit on any error
set -e

echo "Running Database Migration Rollback Checker..."

# Ensure we are in the backend directory
cd "$(dirname "$0")/.."

# Check if migrations directory exists
if [ ! -d "prisma/migrations" ]; then
  echo "No migrations found. Exiting gracefully."
  exit 0
fi

# Find all migrations (excluding migration_lock.toml and any non-directories)
MIGRATIONS=($(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | sort))
NUM_MIGRATIONS=${#MIGRATIONS[@]}

if [ "$NUM_MIGRATIONS" -lt 1 ]; then
  echo "Not enough migrations to test rollback."
  exit 0
fi

LATEST_MIGRATION="${MIGRATIONS[$((NUM_MIGRATIONS-1))]}"
echo "Latest migration is: $(basename "$LATEST_MIGRATION")"

# Prepare N-1 migrations directory
echo "Preparing previous migration state..."
rm -rf prisma/migrations_prev
mkdir -p prisma/migrations_prev
cp -r prisma/migrations/* prisma/migrations_prev/ 2>/dev/null || true
rm -rf "prisma/migrations_prev/$(basename "$LATEST_MIGRATION")"

# Make sure database is fully migrated to state N
echo "Applying all migrations up to state N..."
npx prisma migrate deploy

# Generate the DOWN migration script by diffing N against N-1
echo "Generating down migration for $(basename "$LATEST_MIGRATION")..."
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-migrations prisma/migrations_prev \
  --script > down.sql

echo "Down migration generated:"
cat down.sql

# Execute the DOWN migration
echo "Executing down migration..."
npx prisma db execute --file down.sql

# Verify the database schema matches state N-1
echo "Verifying database schema integrity post-rollback..."
# diff DB vs N-1 migrations. Exit code 0 means no differences (schema matches perfectly).
npx prisma migrate diff \
  --from-config-datasource \
  --to-migrations prisma/migrations_prev \
  --exit-code

echo "Rollback successful! Database schema matches state prior to the latest migration."

# Clean up
rm -rf prisma/migrations_prev down.sql
echo "Database Migration Rollback Checker completed successfully."
