import { lintMigration, isBackfilled } from '../scripts/migration-rollback.js';

describe('migration rollback linter (issue #1124)', () => {
  it('detects a destructive column drop', () => {
    const ops = lintMigration('m1', 'ALTER TABLE "users" DROP COLUMN "legacy_field";');
    expect(ops).toEqual([{ migration: 'm1', kind: 'column_drop', subject: 'legacy_field' }]);
  });

  it('detects DROP COLUMN IF EXISTS', () => {
    const ops = lintMigration('m2', 'ALTER TABLE users DROP COLUMN IF EXISTS x;');
    expect(ops).toEqual([{ migration: 'm2', kind: 'column_drop', subject: 'x' }]);
  });

  it('flags a rename for rollback risk', () => {
    const ops = lintMigration('m3', 'ALTER TABLE "profiles" RENAME COLUMN "bio" TO "bio_new";');
    expect(ops).toEqual([{ migration: 'm3', kind: 'column_rename', subject: 'bio -> bio_new' }]);
  });

  it('detects table drops and renames', () => {
    const ops = lintMigration('m4', 'DROP TABLE IF EXISTS "tmp"; ALTER TABLE "posts" RENAME TO "articles";');
    const kinds = ops.map((o) => o.kind);
    expect(kinds).toContain('table_drop');
    expect(kinds).toContain('table_rename');
  });

  it('treats a destructive op as backfilled when a later migration rewrites the same column', () => {
    const migrations = {
      m1: 'CREATE TABLE users (id int, a text, b text);',
      m2: 'ALTER TABLE users DROP COLUMN a;',
      m3: 'UPDATE users SET b = \'migrated\';',
    };
    expect(isBackfilled('m2', 'a', migrations)).toBe(true);
  });

  it('reports an unbackfilled destructive op', () => {
    const migrations = { m1: 'x', m2: 'ALTER TABLE users DROP COLUMN a;' };
    expect(isBackfilled('m2', 'a', migrations)).toBe(false);
  });

  it('ignores non-destructive SQL', () => {
    const ops = lintMigration('m5', 'CREATE TABLE users (id int); CREATE INDEX idx ON users(id);');
    expect(ops).toEqual([]);
  });
});