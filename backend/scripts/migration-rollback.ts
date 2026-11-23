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

// ── Zero-downtime (locking) statement detection (#1426 / BE-HARD-35) ─────────

export type LockingKind =
  | 'create_index_without_concurrently'
  | 'add_column_not_null'
  | 'set_not_null'
  | 'add_foreign_key_without_not_valid'
  | 'alter_column_type'
  | 'lock_table'
  | 'drop_cascade';

export interface LockingOp {
  migration: string;
  kind: LockingKind;
  subject: string;
}

/** Return the statement containing `index` (up to the next `;`). */
function statementAt(flat: string, index: number): string {
  const end = flat.indexOf(';', index);
  return flat.slice(index, end === -1 ? undefined : end);
}

/**
 * Detect DDL that takes an ACCESS EXCLUSIVE (or long-held) lock and therefore
 * blocks concurrent reads/writes. These are the statements that make a
 * migration unsafe to run against live traffic.
 */
export function lintLockingStatements(name: string, sql: string): LockingOp[] {
  const ops: LockingOp[] = [];
  const flat = sql.replace(/\n/g, ' ').replace(/\/\*.*?\*\//g, ' ');
  let m: RegExpExecArray | null;

  // CREATE [UNIQUE] INDEX without CONCURRENTLY.
  const createIndex = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)"?([\w."]+)"?/gi;
  while ((m = createIndex.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'create_index_without_concurrently',
      subject: m[1].replace(/"/g, ''),
    });
  }

  // ALTER TABLE ... ADD COLUMN <col> ... NOT NULL [without DEFAULT].
  const addNotNull =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?[^;]*?NOT\s+NULL/gi;
  while ((m = addNotNull.exec(flat)) !== null) {
    if (!/\bDEFAULT\b/i.test(statementAt(flat, m.index))) {
      ops.push({
        migration: name,
        kind: 'add_column_not_null',
        subject: `${m[1].replace(/"/g, '')}.${m[2]}`,
      });
    }
  }

  // ALTER TABLE ... ALTER COLUMN <col> SET NOT NULL.
  const setNotNull =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ALTER\s+COLUMN\s+"?(\w+)"?\s+SET\s+NOT\s+NULL/gi;
  while ((m = setNotNull.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'set_not_null',
      subject: `${m[1].replace(/"/g, '')}.${m[2]}`,
    });
  }

  // ADD CONSTRAINT ... FOREIGN KEY ... without NOT VALID.
  const addFk =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ADD\s+CONSTRAINT\s+"?(\w+)"?\s+FOREIGN\s+KEY/gi;
  while ((m = addFk.exec(flat)) !== null) {
    if (!/\bNOT\s+VALID\b/i.test(statementAt(flat, m.index))) {
      ops.push({ migration: name, kind: 'add_foreign_key_without_not_valid', subject: m[2] });
    }
  }

  // ALTER TABLE ... ALTER COLUMN <col> TYPE / SET DATA TYPE.
  const alterType =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ALTER\s+COLUMN\s+"?(\w+)"?\s+(?:TYPE|SET\s+DATA\s+TYPE)\b/gi;
  while ((m = alterType.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'alter_column_type',
      subject: `${m[1].replace(/"/g, '')}.${m[2]}`,
    });
  }

  // Explicit LOCK TABLE.
  const lockTable = /\bLOCK\s+TABLE\s+"?([\w."]+)"?/gi;
  while ((m = lockTable.exec(flat)) !== null) {
    ops.push({ migration: name, kind: 'lock_table', subject: m[1].replace(/"/g, '') });
  }

  // DROP ... CASCADE (destructive and may cascade-lock dependents).
  const dropCascade = /\bDROP\s+(?:TABLE|VIEW|COLUMN|CONSTRAINT|INDEX)\b[^;]*?\bCASCADE\b/gi;
  while ((m = dropCascade.exec(flat)) !== null) {
    ops.push({ migration: name, kind: 'drop_cascade', subject: m[0].trim().slice(0, 60) });
  }

  return ops;
}

/** Scan all migrations and return locking (non-zero-downtime) operations. */
export function scanLockingOps(): LockingOp[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const ops: LockingOp[] = [];
  for (const dir of dirs) {
    const file = join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (existsSync(file)) {
      ops.push(...lintLockingStatements(dir, readFileSync(file, 'utf8')));
    }
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

function runLockLint(): void {
  const ops = scanLockingOps();
  if (ops.length === 0) {
    console.log('[migration-rollback] No locking (non-zero-downtime) statements detected.');
    process.exit(0);
  }
  console.error(`[migration-rollback] ⚠ Locking statements that block active tables (${ops.length}):\n`);
  for (const op of ops) {
    console.error(`  - [${op.kind}] ${op.subject}   (migration: ${op.migration})`);
  }
  console.error(
    '\nUse CREATE INDEX CONCURRENTLY, add nullable columns first, and ADD CONSTRAINT ... NOT VALID to avoid locking tables.'
  );
  process.exit(opts.exitNonZeroOnLint ? 1 : 0);
}

const opts = { exitNonZeroOnLint: false };
const args = process.argv.slice(2);
const mode = args.includes('--verify')
  ? 'verify'
  : args.includes('--scan-locks')
    ? 'locks'
    : 'lint';
if (args.includes('--strict-lint')) opts.exitNonZeroOnLint = true;

// Allow importing for tests without auto-running.
const isDirectRun =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('migration-rollback.ts');

if (isDirectRun) {
  if (mode === 'verify') runVerify();
  else if (mode === 'locks') runLockLint();
  else runLint();
}

export { MIGRATIONS_DIR };
export default scanDestructiveOps;