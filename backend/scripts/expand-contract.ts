/**
 * expand-contract.ts — Issue #1426 / BE-HARD-35
 *
 * Zero-downtime blue/green migration planner.
 *
 * Implements the phases of an expand-contract (a.k.a. parallel-change)
 * schema migration so a column can be introduced/renamed while the old and new
 * application versions run side by side:
 *
 *   1. expand       — additive, nullable DDL (metadata-only; never rewrites)
 *   2. dual-write   — a trigger keeps old <-> new columns in sync
 *   3. backfill     — asynchronously copy existing values in small batches
 *   4. compat view  — a backwards-compatible view exposes the resolved value
 *   5. contract     — drop the trigger + legacy column in a follow-up release
 *
 * `rollback` reverses the expand/dual-write phases instantly (dropping only the
 * new column + trigger, leaving the legacy column and its data intact), which is
 * what makes the cutover reversible without downtime.
 *
 * `CREATE INDEX CONCURRENTLY` (and any `CONCURRENTLY` DDL) cannot run inside a
 * transaction — `runStatements` therefore takes a plain executor and never wraps
 * statements in a transaction.
 */

import {
  lintLockingStatements,
  MIGRATION_LOCK_TIMEOUT_MS,
  MIGRATION_STATEMENT_TIMEOUT_MS,
} from './migration-rollback.js';

export type MigrationPhase =
  | 'expand'
  | 'dual-write'
  | 'backfill'
  | 'compat-view'
  | 'contract'
  | 'rollback';

export const MIGRATION_PHASES: MigrationPhase[] = [
  'expand',
  'dual-write',
  'backfill',
  'compat-view',
  'contract',
  'rollback',
];

export interface MigrationStatement {
  phase: MigrationPhase;
  sql: string;
  /** True when the statement does not lock active tables. */
  zeroDowntime: boolean;
  rationale: string;
}

export interface ColumnRenamePlan {
  table: string;
  oldColumn: string;
  newColumn: string;
  /** Stable primary key used to select each backfill batch. Defaults to `id`. */
  primaryKey?: string;
  /** Postgres column type, e.g. `TEXT`, `INTEGER`, `JSONB`. Defaults to `TEXT`. */
  dataType?: string;
}

/** Session guards applied before online DDL so a blocked lock aborts fast. */
export const ONLINE_SESSION_PREAMBLE = [
  `SET lock_timeout = '${MIGRATION_LOCK_TIMEOUT_MS}ms'`,
  `SET statement_timeout = '${MIGRATION_STATEMENT_TIMEOUT_MS}ms'`,
];

export interface BackfillExecutor {
  /** Execute one update batch and return the number of updated rows. */
  executeBatch(sql: string): Promise<number>;
  /** Check for unprocessed rows after a batch, including rows skipped while locked. */
  hasPendingRows(sql: string): Promise<boolean>;
}

export interface BackfillOptions {
  batchSize?: number;
  pauseMs?: number;
  maxIdleBatches?: number;
}

const ident = (name: string): string => `"${name.replace(/"/g, '""')}"`;

function functionName(table: string, column: string): string {
  return `sync_${table}_${column}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function triggerName(table: string, column: string): string {
  return `trg_${functionName(table, column)}`;
}

function backfillBatchSql(plan: ColumnRenamePlan, batchSize: number): string {
  const table = ident(plan.table);
  const oldColumn = ident(plan.oldColumn);
  const newColumn = ident(plan.newColumn);
  const primaryKey = ident(plan.primaryKey ?? 'id');
  return compact(`
    WITH batch AS (
      SELECT ${primaryKey}
      FROM ${table}
      WHERE ${newColumn} IS NULL AND ${oldColumn} IS NOT NULL
      ORDER BY ${primaryKey}
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${table} AS target
    SET ${newColumn} = target.${oldColumn}
    FROM batch
    WHERE target.${primaryKey} = batch.${primaryKey};
  `);
}

function backfillPendingSql(plan: ColumnRenamePlan): string {
  return compact(`
    SELECT EXISTS (
      SELECT 1 FROM ${ident(plan.table)}
      WHERE ${ident(plan.newColumn)} IS NULL AND ${ident(plan.oldColumn)} IS NOT NULL
    ) AS pending;
  `);
}

/** Repeatedly copy legacy values in short, non-blocking batches. */
export async function runBatchedBackfill(
  executor: BackfillExecutor,
  plan: ColumnRenamePlan,
  options: BackfillOptions = {},
): Promise<number> {
  const batchSize = options.batchSize ?? 500;
  const pauseMs = options.pauseMs ?? 25;
  const maxIdleBatches = options.maxIdleBatches ?? 120;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Backfill batchSize must be a positive integer');
  }
  if (!Number.isInteger(pauseMs) || pauseMs < 0) {
    throw new Error('Backfill pauseMs must be a non-negative integer');
  }
  if (!Number.isInteger(maxIdleBatches) || maxIdleBatches < 1) {
    throw new Error('Backfill maxIdleBatches must be a positive integer');
  }

  const batchSql = backfillBatchSql(plan, batchSize);
  const pendingSql = backfillPendingSql(plan);
  let totalUpdated = 0;
  let idleBatches = 0;

  while (true) {
    const updated = await executor.executeBatch(batchSql);
    if (!Number.isInteger(updated) || updated < 0 || updated > batchSize) {
      throw new Error('Backfill executor returned an invalid batch row count');
    }

    totalUpdated += updated;
    if (updated === 0) {
      if (!(await executor.hasPendingRows(pendingSql))) return totalUpdated;
      idleBatches += 1;
      if (idleBatches >= maxIdleBatches) {
        throw new Error(
          `Backfill stopped after ${maxIdleBatches} empty batches while rows remained locked`,
        );
      }
    } else {
      idleBatches = 0;
    }

    if (pauseMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, pauseMs));
    }
  }
}

/** True when a SQL statement does not take a blocking lock on active tables. */
export function isZeroDowntime(sql: string): boolean {
  return lintLockingStatements('inline', sql).length === 0;
}

function statement(
  phase: MigrationPhase,
  sql: string,
  rationale: string,
): MigrationStatement {
  return { phase, sql, zeroDowntime: isZeroDowntime(sql), rationale };
}

/** A single-line SQL statement (dedented) for logging / execution. */
function compact(sql: string): string {
  return sql.replace(/\n\s*/g, ' ').trim();
}

/**
 * Build the forward expand-contract statements for a column rename/rollout.
 */
export function expandContractStatements(plan: ColumnRenamePlan): MigrationStatement[] {
  const { table, oldColumn, newColumn } = plan;
  const dataType = plan.dataType ?? 'TEXT';
  const fn = ident(functionName(table, newColumn));
  const trg = ident(triggerName(table, newColumn));
  const t = ident(table);
  const oldIdent = ident(oldColumn);
  const newIdent = ident(newColumn);
  const resolved = ident(`${newColumn}_resolved`);
  const batchSql = backfillBatchSql(plan, 500);

  return [
    statement(
      'expand',
      compact(
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${newIdent} ${dataType};`,
      ),
      'Additive nullable column — metadata-only, no table rewrite and no long lock.',
    ),
    statement(
      'dual-write',
      compact(`
        CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$
        BEGIN
          IF NEW.${newIdent} IS NULL AND NEW.${oldIdent} IS NOT NULL THEN
            NEW.${newIdent} := NEW.${oldIdent};
          END IF;
          IF NEW.${oldIdent} IS NULL AND NEW.${newIdent} IS NOT NULL THEN
            NEW.${oldIdent} := NEW.${newIdent};
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `),
      'Dual-write trigger keeps the legacy and new columns consistent.',
    ),
    statement(
      'dual-write',
      compact(`
        DROP TRIGGER IF EXISTS ${trg} ON ${t};
        CREATE TRIGGER ${trg} BEFORE INSERT OR UPDATE ON ${t}
          FOR EACH ROW EXECUTE FUNCTION ${fn}();
      `),
      'Attach the dual-write trigger (idempotent).',
    ),
    statement(
      'backfill',
      batchSql,
      'Execute with runBatchedBackfill to copy existing values in short, retryable batches.',
    ),
    statement(
      'compat-view',
      compact(`
        CREATE OR REPLACE VIEW ${ident(`${table}_compat`)} AS
        SELECT *, COALESCE(${newIdent}, ${oldIdent}) AS ${resolved}
        FROM ${t};
      `),
      'Backwards-compatible view resolves either column for old readers.',
    ),
  ];
}

/** Generate contract DDL separately so it can only be applied in a follow-up release. */
export function contractStatements(plan: ColumnRenamePlan): MigrationStatement[] {
  const { table, oldColumn, newColumn } = plan;
  const fn = ident(functionName(table, newColumn));
  const trg = ident(triggerName(table, newColumn));
  const t = ident(table);

  return [
    statement(
      'contract',
      compact(`
        DROP TRIGGER IF EXISTS ${trg} ON ${t};
        DROP FUNCTION IF EXISTS ${fn}();
        ALTER TABLE ${t} DROP COLUMN IF EXISTS ${ident(oldColumn)};
        CREATE OR REPLACE VIEW ${ident(`${table}_compat`)} AS SELECT * FROM ${t};
      `),
      'Follow-up release only: remove legacy schema after all deployed readers and writers have moved.',
    ),
  ];
}

/**
 * Build the instantaneous rollback statements (pre-contract). The legacy
 * column and its data are never touched, so this is reversible in one step.
 */
export function rollbackStatements(plan: ColumnRenamePlan): MigrationStatement[] {
  const { table, oldColumn, newColumn } = plan;
  const fn = ident(functionName(table, newColumn));
  const trg = ident(triggerName(table, newColumn));
  const t = ident(table);
  const oldIdent = ident(oldColumn);
  const newIdent = ident(newColumn);
  const resolved = ident(`${newColumn}_resolved`);

  return [
    statement(
      'rollback',
      compact(`
        DROP TRIGGER IF EXISTS ${trg} ON ${t};
        DROP FUNCTION IF EXISTS ${fn}();
        ALTER TABLE ${t} DROP COLUMN IF EXISTS ${newIdent};
        CREATE OR REPLACE VIEW ${ident(`${table}_compat`)} AS
        SELECT *, ${oldIdent} AS ${resolved} FROM ${t};
      `),
      'Instant rollback: drop only the new column + trigger; legacy data is untouched.',
    ),
  ];
}

/** All statements for a single phase. */
export function statementsForPhase(
  plan: ColumnRenamePlan,
  phase: MigrationPhase,
): MigrationStatement[] {
  if (phase === 'rollback') {
    return rollbackStatements(plan);
  }
  if (phase === 'contract') {
    return contractStatements(plan);
  }
  return expandContractStatements(plan).filter((s) => s.phase === phase);
}

/**
 * Execute online DDL outside any transaction (required for `CONCURRENTLY`),
 * applying a fast-fail lock/statement timeout first.
 */
export async function runStatements(
  executor: (sql: string) => Promise<unknown>,
  statements: MigrationStatement[],
  options: { sessionPreamble?: boolean } = {},
): Promise<string[]> {
  const applied: string[] = [];

  if (options.sessionPreamble !== false) {
    for (const sql of ONLINE_SESSION_PREAMBLE) {
      await executor(sql);
      applied.push(sql);
    }
  }

  for (const item of statements) {
    await executor(item.sql);
    applied.push(item.sql);
  }

  return applied;
}

// ── CLI: print a phased plan (no DB connection required) ─────────────────────

const isDirectRun =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('expand-contract.ts');

if (isDirectRun) {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index !== -1 ? args[index + 1] : undefined;
  };
  const table = flag('--table');
  const oldColumn = flag('--old');
  const newColumn = flag('--new');

  if (args.includes('--plan') && table && oldColumn && newColumn) {
    const plan: ColumnRenamePlan = {
      table,
      oldColumn,
      newColumn,
      primaryKey: flag('--key') ?? 'id',
      dataType: flag('--type') ?? 'TEXT',
    };
    const phaseFlag = flag('--phase');
    if (phaseFlag && !MIGRATION_PHASES.includes(phaseFlag as MigrationPhase)) {
      console.error(`Unknown migration phase: ${phaseFlag}`);
      process.exit(1);
    }
    const statements = phaseFlag
      ? statementsForPhase(plan, phaseFlag as MigrationPhase)
      : expandContractStatements(plan);
    for (const item of statements) {
      const flagLabel = item.zeroDowntime ? 'zero-downtime' : 'LOCKS TABLES';
      console.log(`-- [${item.phase}] (${flagLabel}) ${item.rationale}\n${item.sql}\n`);
    }
    if (!phaseFlag) {
      console.log('-- [contract] omitted; apply explicitly in a follow-up release with --phase contract.');
    }
    if (!phaseFlag) {
      console.log('-- [rollback] (zero-downtime)');
      for (const item of rollbackStatements(plan)) {
        console.log(`${item.sql}\n`);
      }
    }
    process.exit(0);
  }

  console.log(
    'Usage: tsx scripts/expand-contract.ts --plan --table <table> --old <col> --new <col> [--key id] [--type TEXT] [--phase <phase>]',
  );
  process.exit(0);
}
