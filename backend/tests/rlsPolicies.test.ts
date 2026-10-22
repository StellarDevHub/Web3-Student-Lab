import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createRlsQueryHandler,
  resolveRlsSettings,
  withWorkspaceTransaction,
  type RlsBaseClient,
} from '../src/db/prismaMiddleware.js';
import { workspaceModels } from '../src/db/workspaceModels.js';
import { runAsSystem, runWithWorkspace } from '../src/middleware/WorkspaceContext.js';

const MIGRATION_SQL = readFileSync(
  join(__dirname, '../prisma/migrations/20261022000000_rls_policies/migration.sql'),
  'utf8'
);
const SCHEMA = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8');

/** Map every Prisma model name to its table name (@@map, or the model name). */
const modelTables = (): Map<string, string> => {
  const tables = new Map<string, string>();
  for (const match of SCHEMA.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = match;
    const mapped = body!.match(/@@map\("([^"]+)"\)/);
    tables.set(model!, mapped ? mapped[1]! : model!);
  }
  return tables;
};

const rlsTables = (): string[] => {
  const array = MIGRATION_SQL.match(/ARRAY\[([\s\S]*?)\]/);
  return [...(array?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]!);
};

interface RecordedStatement {
  sql: string;
  values: unknown[];
}

/** Fake unextended Prisma client recording set_config statements per batch. */
const createBaseClient = () => {
  const batches: RecordedStatement[][] = [];
  const base = {
    $executeRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join('?'),
      values,
    })),
    $transaction: jest.fn(async (operations: unknown[]) => {
      batches.push(operations.slice(0, -1) as RecordedStatement[]);
      return Promise.all(operations);
    }),
  };
  return { base: base as unknown as RlsBaseClient & typeof base, batches };
};

const runQuery = (base: RlsBaseClient, model: string, result: unknown = [{ id: 'row-1' }]) => {
  const query = jest.fn(async (_args: unknown) => result);
  return {
    query,
    promise: createRlsQueryHandler(base)({ model, operation: 'findMany', args: { where: {} }, query }),
  };
};

describe('RLS migration (BE-005)', () => {
  it('covers the table of every workspace-scoped Prisma model', () => {
    const tables = modelTables();
    const covered = new Set(rlsTables());
    for (const model of workspaceModels) {
      expect(tables.has(model)).toBe(true);
      expect(covered).toContain(tables.get(model));
    }
    expect(covered.size).toBe(workspaceModels.size);
  });

  it('enables and forces RLS with a policy guarding reads and writes', () => {
    expect(MIGRATION_SQL).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION_SQL).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(MIGRATION_SQL).toMatch(/USING \(app_rls_bypassed\(\) OR "workspaceId" = app_current_workspace_id\(\)\)/);
    expect(MIGRATION_SQL).toMatch(/WITH CHECK \(app_rls_bypassed\(\) OR "workspaceId" = app_current_workspace_id\(\)\)/);
    // An unset or empty setting must match nothing rather than every row.
    expect(MIGRATION_SQL).toMatch(/NULLIF\(current_setting\('app\.current_workspace_id', true\), ''\)/);
  });
});

describe('Prisma RLS extension (BE-005)', () => {
  const originalUnscoped = process.env.RLS_UNSCOPED_ACCESS;

  beforeEach(() => {
    delete process.env.RLS_UNSCOPED_ACCESS;
  });

  afterEach(() => {
    if (originalUnscoped === undefined) delete process.env.RLS_UNSCOPED_ACCESS;
    else process.env.RLS_UNSCOPED_ACCESS = originalUnscoped;
  });

  it('sets the workspace transaction-locally before every workspace-scoped query', async () => {
    const { base, batches } = createBaseClient();

    const result = await runWithWorkspace('workspace-a', () => runQuery(base, 'Student').promise);

    expect(result).toEqual([{ id: 'row-1' }]);
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    const [statement] = batches[0]!;
    expect(statement!.sql).toContain("set_config('app.current_workspace_id', ?, TRUE)");
    expect(statement!.sql).toContain("set_config('app.bypass_rls', ?, TRUE)");
    expect(statement!.values).toEqual(['workspace-a', 'off']);
  });

  it('injects each request’s own workspace under concurrency', async () => {
    const { base, batches } = createBaseClient();

    await Promise.all([
      runWithWorkspace('workspace-a', () => runQuery(base, 'Enrollment').promise),
      runWithWorkspace('workspace-b', () => runQuery(base, 'Enrollment').promise),
      runWithWorkspace('workspace-c', () => runQuery(base, 'AuditLog').promise),
    ]);

    expect(batches.map((b) => b[0]!.values[0]).sort()).toEqual(['workspace-a', 'workspace-b', 'workspace-c']);
  });

  it('passes through models that are not workspace-scoped', async () => {
    const { base } = createBaseClient();
    const { query, promise } = runQuery(base, 'User');

    await runWithWorkspace('workspace-a', () => promise);

    expect(query).toHaveBeenCalledTimes(1);
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('bypasses RLS only for explicit system context when unscoped access is denied', async () => {
    process.env.RLS_UNSCOPED_ACCESS = 'deny';
    const { base, batches } = createBaseClient();

    await runAsSystem(() => runQuery(base, 'Course').promise);
    expect(batches[0]![0]!.values).toEqual(['', 'on']);

    // Without any context nothing is set, so the database returns zero rows.
    expect(resolveRlsSettings()).toBeNull();
    const { query } = runQuery(base, 'Course');
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
    expect(base.$transaction).toHaveBeenCalledTimes(1);
  });

  it('treats unscoped queries as system queries by default for backward compatibility', () => {
    expect(resolveRlsSettings()).toEqual({ workspaceId: '', bypass: true });
  });

  it('never lets system context override an active workspace', async () => {
    process.env.RLS_UNSCOPED_ACCESS = 'deny';
    await runAsSystem(() =>
      runWithWorkspace('workspace-a', async () => {
        expect(resolveRlsSettings()).toEqual({ workspaceId: 'workspace-a', bypass: false });
      })
    );
  });

  it('applies context once per interactive transaction without re-wrapping its queries', async () => {
    const { base } = createBaseClient();
    const tx = { $executeRaw: base.$executeRaw };
    const client = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const result = await runWithWorkspace('workspace-a', () =>
      withWorkspaceTransaction(client, async () => runQuery(base, 'Student', 'inner').promise)
    );

    expect(result).toBe('inner');
    expect(base.$executeRaw).toHaveBeenCalledTimes(1);
    expect(base.$executeRaw.mock.calls[0]!.slice(1)).toEqual(['workspace-a', 'off']);
    expect(base.$transaction).not.toHaveBeenCalled();
  });
});
