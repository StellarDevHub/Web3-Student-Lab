/**
 * Database-engine enforcement of workspace RLS (BE-005).
 *
 * Runs the real migration against PostgreSQL as a non-superuser table owner
 * (superusers always bypass RLS) and proves cross-tenant access is blocked by
 * the engine itself, independent of any application-level filtering.
 *
 * Requires a disposable database: RLS_TEST_DATABASE_URL=postgres://... with a
 * role allowed to CREATE ROLE / CREATE SCHEMA. Skipped when unset.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from 'pg';

const { Client } = pkg;
const url = process.env.RLS_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const suffix = `${process.pid}_${Date.now()}`;
const SCHEMA = `rls_test_${suffix}`;
const ROLE = `rls_tenant_app_${suffix}`;
const MIGRATION_SQL = readFileSync(
  join(__dirname, '../prisma/migrations/20261022000000_rls_policies/migration.sql'),
  'utf8'
);

describeDb('PostgreSQL row-level security (BE-005)', () => {
  const admin = new Client({ connectionString: url });
  const app = new Client({ connectionString: url });

  /** Run statements in one transaction with transaction-local settings. */
  const inTx = async <T>(settings: Record<string, string>, fn: () => Promise<T>): Promise<T> => {
    await app.query('BEGIN');
    try {
      for (const [name, value] of Object.entries(settings)) {
        await app.query('SELECT set_config($1, $2, true)', [name, value]);
      }
      const result = await fn();
      await app.query('COMMIT');
      return result;
    } catch (error) {
      await app.query('ROLLBACK');
      throw error;
    }
  };

  const studentIds = async (): Promise<string[]> =>
    (await app.query('SELECT id FROM students ORDER BY id')).rows.map((r: { id: string }) => r.id);

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE ROLE ${ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`CREATE SCHEMA ${SCHEMA} AUTHORIZATION ${ROLE}`);

    await app.connect();
    await app.query(`SET ROLE ${ROLE}`);
    await app.query(`SET search_path TO ${SCHEMA}`);
    // The application role owns the tables, so only FORCE makes RLS apply to it.
    await app.query(`
      CREATE TABLE students (id text PRIMARY KEY, "workspaceId" text NOT NULL DEFAULT 'default');
      CREATE TABLE enrollments (id text PRIMARY KEY, "studentId" text NOT NULL, "workspaceId" text NOT NULL DEFAULT 'default');
      INSERT INTO students VALUES ('a-1', 'workspace-a'), ('a-2', 'workspace-a'), ('b-1', 'workspace-b');
      INSERT INTO enrollments VALUES ('e-a', 'a-1', 'workspace-a'), ('e-b', 'b-1', 'workspace-b');
    `);
    await app.query(MIGRATION_SQL);
  });

  afterAll(async () => {
    await app.end().catch(() => undefined);
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  });

  it('returns zero rows for direct queries without workspace context', async () => {
    expect(await studentIds()).toEqual([]);
    expect((await app.query('SELECT count(*)::int AS n FROM enrollments')).rows[0].n).toBe(0);
  });

  it('returns only the matching workspace’s rows', async () => {
    const a = await inTx({ 'app.current_workspace_id': 'workspace-a' }, studentIds);
    const b = await inTx({ 'app.current_workspace_id': 'workspace-b' }, studentIds);
    expect(a).toEqual(['a-1', 'a-2']);
    expect(b).toEqual(['b-1']);
  });

  it('blocks reading another tenant’s row even by primary key', async () => {
    const rows = await inTx({ 'app.current_workspace_id': 'workspace-a' }, async () =>
      (await app.query("SELECT id FROM students WHERE id = 'b-1'")).rows
    );
    expect(rows).toEqual([]);
  });

  it('blocks cross-tenant updates and deletes', async () => {
    const counts = await inTx({ 'app.current_workspace_id': 'workspace-a' }, async () => ({
      updated: (await app.query(`UPDATE students SET "workspaceId" = 'workspace-a' WHERE id = 'b-1'`)).rowCount,
      deleted: (await app.query(`DELETE FROM enrollments WHERE id = 'e-b'`)).rowCount,
    }));
    expect(counts).toEqual({ updated: 0, deleted: 0 });
    expect(await inTx({ 'app.current_workspace_id': 'workspace-b' }, studentIds)).toEqual(['b-1']);
  });

  it('rejects inserting rows into another workspace', async () => {
    await expect(
      inTx({ 'app.current_workspace_id': 'workspace-a' }, () =>
        app.query(`INSERT INTO students VALUES ('b-2', 'workspace-b')`)
      )
    ).rejects.toThrow(/row-level security/);
  });

  it('does not leak SET LOCAL context past the transaction', async () => {
    await inTx({ 'app.current_workspace_id': 'workspace-a' }, studentIds);
    expect(await studentIds()).toEqual([]);
  });

  it('allows explicit system bypass for trusted jobs', async () => {
    const all = await inTx({ 'app.bypass_rls': 'on' }, studentIds);
    expect(all).toEqual(['a-1', 'a-2', 'b-1']);
  });
});
