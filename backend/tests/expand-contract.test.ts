import { describe, expect, it, jest } from '@jest/globals';
import { lintLockingStatements, scanLockingOps } from '../scripts/migration-rollback.js';
import {
  expandContractStatements,
  isZeroDowntime,
  rollbackStatements,
  runStatements,
  statementsForPhase,
  ONLINE_SESSION_PREAMBLE,
  type MigrationStatement,
} from '../scripts/expand-contract.js';

/**
 * Zero-downtime blue/green migration tests (#1426 / BE-HARD-35).
 */

const plan = {
  table: 'students',
  oldColumn: 'githubUsername',
  newColumn: 'githubHandle',
  dataType: 'TEXT',
};

describe('isZeroDowntime (#1426)', () => {
  it('allows additive nullable columns and concurrent index builds', () => {
    expect(isZeroDowntime('ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "x" TEXT;')).toBe(true);
    expect(isZeroDowntime('CREATE INDEX CONCURRENTLY "idx" ON "students"("x");')).toBe(true);
    expect(isZeroDowntime('ALTER TABLE "students" DROP COLUMN IF EXISTS "x";')).toBe(true);
    expect(
      isZeroDowntime(
        'ALTER TABLE "students" ADD CONSTRAINT "fk" FOREIGN KEY ("a") REFERENCES "b"("id") NOT VALID;',
      ),
    ).toBe(true);
  });

  it('flags statements that lock active tables', () => {
    expect(isZeroDowntime('CREATE INDEX "idx" ON "students"("x");')).toBe(false);
    expect(isZeroDowntime('ALTER TABLE "students" ADD COLUMN "x" TEXT NOT NULL;')).toBe(false);
    expect(isZeroDowntime('ALTER TABLE "students" ALTER COLUMN "x" SET NOT NULL;')).toBe(false);
    expect(
      isZeroDowntime(
        'ALTER TABLE "students" ADD CONSTRAINT "fk" FOREIGN KEY ("a") REFERENCES "b"("id");',
      ),
    ).toBe(false);
    expect(isZeroDowntime('ALTER TABLE "students" ALTER COLUMN "x" TYPE BIGINT;')).toBe(false);
    expect(isZeroDowntime('LOCK TABLE "students" IN ACCESS EXCLUSIVE MODE;')).toBe(false);
    expect(isZeroDowntime('DROP TABLE "students" CASCADE;')).toBe(false);
  });
});

describe('lintLockingStatements (#1426)', () => {
  it('reports the locking kind and subject', () => {
    const ops = lintLockingStatements(
      'm1',
      'CREATE INDEX "idx" ON "students"("x"); ALTER TABLE "students" ALTER COLUMN "y" SET NOT NULL;',
    );
    expect(ops).toEqual(
      expect.arrayContaining([
        { migration: 'm1', kind: 'create_index_without_concurrently', subject: 'idx' },
        { migration: 'm1', kind: 'set_not_null', subject: 'students.y' },
      ]),
    );
  });

  it('treats NOT VALID foreign keys and concurrent indexes as safe', () => {
    expect(
      lintLockingStatements(
        'm1',
        'CREATE INDEX CONCURRENTLY "idx" ON "t"("c"); ALTER TABLE "t" ADD CONSTRAINT "fk" FOREIGN KEY ("c") REFERENCES "u"("id") NOT VALID;',
      ),
    ).toHaveLength(0);
  });

  it('scanLockingOps is tolerant of a missing migrations dir', () => {
    expect(Array.isArray(scanLockingOps())).toBe(true);
  });
});

describe('expand-contract planner (#1426)', () => {
  it('produces the expand -> dual-write -> compat-view -> contract phases in order', () => {
    const statements = expandContractStatements(plan);
    expect(statements.map((s) => s.phase)).toEqual([
      'expand',
      'dual-write',
      'dual-write',
      'compat-view',
      'contract',
    ]);
    // Every phase here must be lock-free.
    expect(statements.every((s) => s.zeroDowntime)).toBe(true);
  });

  it('expand adds a nullable column without locking', () => {
    const [expand] = statementsForPhase(plan, 'expand');
    expect(expand?.sql).toContain('ADD COLUMN IF NOT EXISTS "githubHandle" TEXT');
    expect(expand?.zeroDowntime).toBe(true);
  });

  it('dual-write installs a sync trigger', () => {
    const dual = statementsForPhase(plan, 'dual-write');
    const combined = dual.map((s) => s.sql).join('\n');
    expect(combined).toContain('CREATE OR REPLACE FUNCTION "sync_students_githubhandle"()');
    expect(combined).toContain('CREATE TRIGGER "trg_sync_students_githubhandle"');
  });

  it('exposes a backwards-compatible view resolving both columns', () => {
    const [view] = statementsForPhase(plan, 'compat-view');
    expect(view?.sql).toContain('CREATE OR REPLACE VIEW "students_compat"');
    expect(view?.sql).toContain('COALESCE("githubHandle", "githubUsername")');
  });

  it('contract drops the legacy column', () => {
    const [contract] = statementsForPhase(plan, 'contract');
    expect(contract?.sql).toContain('DROP COLUMN IF EXISTS "githubUsername"');
  });

  it('rollback drops only the new column + trigger and preserves legacy data', () => {
    const [rollback] = rollbackStatements(plan);
    expect(rollback?.sql).toContain('DROP TRIGGER IF EXISTS "trg_sync_students_githubhandle"');
    expect(rollback?.sql).toContain('DROP COLUMN IF EXISTS "githubHandle"');
    expect(rollback?.sql).not.toContain('DROP COLUMN IF EXISTS "githubUsername"');
    expect(rollback?.zeroDowntime).toBe(true);
  });
});

describe('runStatements (#1426)', () => {
  it('applies a fast-fail lock timeout then each statement outside a transaction', async () => {
    const executor = jest.fn<(sql: string) => Promise<unknown>>().mockResolvedValue(undefined);
    const statements: MigrationStatement[] = [
      { phase: 'expand', sql: 'ALTER TABLE "t" ADD COLUMN "c" TEXT;', zeroDowntime: true, rationale: '' },
    ];

    const applied = await runStatements(executor, statements);

    expect(executor).toHaveBeenNthCalledWith(1, ONLINE_SESSION_PREAMBLE[0]);
    expect(executor).toHaveBeenNthCalledWith(2, ONLINE_SESSION_PREAMBLE[1]);
    expect(executor).toHaveBeenLastCalledWith('ALTER TABLE "t" ADD COLUMN "c" TEXT;');
    expect(applied).toEqual([...ONLINE_SESSION_PREAMBLE, 'ALTER TABLE "t" ADD COLUMN "c" TEXT;']);
  });

  it('can skip the session preamble', async () => {
    const executor = jest.fn<(sql: string) => Promise<unknown>>().mockResolvedValue(undefined);
    await runStatements(executor, [], { sessionPreamble: false });
    expect(executor).not.toHaveBeenCalled();
  });
});
