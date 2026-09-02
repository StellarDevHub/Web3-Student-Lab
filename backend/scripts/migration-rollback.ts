/**
 * migration-rollback.ts — Issue #1124
 *
 * Automated database migration rollback verification CLI.
 *
 * Two responsibilities:
 *  1. `--lint`  — scan every Prisma migration SQL file for DESTRUCTIVE operations
 *                 (column drops/renames, table drops/renames) and alert when they
 *                 are not accompanied by a data-backfill migration. This is the
 *                 guard rail that prevents silent data loss in production.
 *  2. `--verify` — run forward `prisma migrate deploy` then a down-migration
 *                  rollback and a PostgreSQL schema-parity check (delegates to the
 *                  existing `scripts/test-migration-rollback.sh` for the container
 *                  bootstrap + catalog diff).
 *
 * Usage (from backend/):
 *   npm run migration:lint
 *   npm run migration:verify
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

export interface DestructiveOp {
  migration: string;
  kind: 'column_drop' | 'column_rename' | 'table_drop' | 'table_rename';
  subject: string;
}

/**
 * A destructive operation is "backfilled" if a migration that arrives AFTER the
 * destructive one contains the backfill markers (INSERT/SELECT rewriting, a
 * dedicated `_backfill`/`data_migration` style). To stay conservative we look
 * for subsequent migrations that reference the same column/table name.
 */
export function isBackfilled(
  migrationName: string,
  subject: string,
  migrationsByName: Record<string, string>
): boolean {
  const keys = Object.keys(migrationsByName).sort();
  const idx = keys.indexOf(migrationName);
  if (idx === -1) return false;
  const later = keys.slice(idx + 1);
  if (later.length === 0) return false;
  return later.some((name) => migrationsByName[name].toLowerCase().includes(subject.toLowerCase()));
}

/**
 * Parse a single migration's SQL for destructive statements. Returns an array of
 * operations with their kind and subject (table or column identifier).
 */
export function lintMigration(name: string, sql: string): DestructiveOp[] {
  const ops: DestructiveOp[] = [];
  // Normalize to a single line to ease regex matching across newlines.
  const flat = sql.replace(/\n/g, ' ').replace(/\/\*.*?\*\//g, ' ');

  // ALTER TABLE ... DROP COLUMN <name>  (optionally "DROP COLUMN IF EXISTS <name>")
  const dropCol = /ALTER\s+TABLE\s+(?:"?[\w."]+"?)\s+DROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+"?(\w+)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = dropCol.exec(flat)) !== null) {
    ops.push({ migration: name, kind: 'column_drop', subject: m[1] });
  }

  // ALTER TABLE ... RENAME COLUMN <a> TO <b>  — rows keep data but the schema name changes;
  // code/backfills referencing the old name are at risk.
  const renameCol =
    /ALTER\s+TABLE\s+(?:"?[\w."]+"?)\s+RENAME\s+COLUMN\s+"?(\w+)"?\s+TO\s+"?(\w+)"?/gi;
  while ((m = renameCol.exec(flat)) !== null) {
    ops.push({ migration: name, kind: 'column_rename', subject: `${m[1]} -> ${m[2]}` });
  }

  // DROP TABLE [IF EXISTS] <name> [CASCADE]
  const dropTable = /DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:"?([\w."]+)"?)(?:\s+CASCADE)?/gi;
  while ((m = dropTable.exec(flat)) !== null) {
    ops.push({ migration: name, kind: 'table_drop', subject: m[1].replace(/"/g, '') });
  }

  // ALTER TABLE <name> RENAME TO <name2>
  const renameTable =
    /ALTER\s+TABLE\s+(?:"?([\w."]+)"?)\s+RENAME\s+TO\s+(?:"?([\w."]+)"?)/gi;
  while ((m = renameTable.exec(flat)) !== null) {
    ops.push({ migration: name, kind: 'table_rename', subject: `${m[1].replace(/"/g, '')} -> ${m[2].replace(/"/g, '')}` });
  }

  return ops;
}

/** Scan all migrations and return destructive ops that lack a backfill. */
export function scanDestructiveOps(): DestructiveOp[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const sqlByName: Record<string, string> = {};
  for (const dir of dirs) {
    const file = join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (existsSync(file)) sqlByName[dir] = readFileSync(file, 'utf8');
  }

  const ops: DestructiveOp[] = [];
  for (const [name, sql] of Object.entries(sqlByName)) {
    for (const op of lintMigration(name, sql)) {
      if (!isBackfilled(name, op.subject.split(' -> ')[0], sqlByName)) {
        ops.push(op);
      }
    }
  }
  return ops;
}

function runVerify(): void {
  const script = join(process.cwd(), 'scripts', 'test-migration-rollback.sh');
  if (!existsSync(script)) {
    console.error('[migration-rollback] Could not find scripts/test-migration-rollback.sh');
    process.exit(1);
  }
  console.log('[migration-rollback] Running forward deploy + down rollback + schema parity (via test-migration-rollback.sh)...');
  try {
    execSync(`bash "${script}"`, { stdio: 'inherit', cwd: process.cwd() });
  } catch (err) {
    console.error('[migration-rollback] Verification failed:', (err as Error).message);
    process.exit(1);
  }
}

function runLint(): void {
  const ops = scanDestructiveOps();
  if (ops.length === 0) {
    console.log('[migration-rollback] No destructive operations detected (or all are backfilled).');
    process.exit(0);
  }
  console.error(`[migration-rollback] ⚠ Destructive migration operations lacking a data backfill (${ops.length}):\n`);
  for (const op of ops) {
    console.error(`  - [${op.kind}] ${op.subject}   (migration: ${op.migration})`);
  }
  console.error('\nAdd a follow-up backfill migration that rewrites the data so nothing is lost, or explicitly acknowledge it.');
  process.exit(opts.exitNonZeroOnLint ? 1 : 0);
}

const opts = { exitNonZeroOnLint: false };
const args = process.argv.slice(2);
const mode = args.includes('--verify') ? 'verify' : 'lint';
if (args.includes('--strict-lint')) opts.exitNonZeroOnLint = true;

// Allow importing for tests without auto-running.
const isDirectRun =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('migration-rollback.ts');

if (isDirectRun) {
  if (mode === 'verify') runVerify();
  else runLint();
}

export { MIGRATIONS_DIR };
export default scanDestructiveOps;