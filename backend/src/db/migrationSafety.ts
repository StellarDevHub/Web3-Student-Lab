export const MIGRATION_LOCK_TIMEOUT_MS = 500;
export const MIGRATION_STATEMENT_TIMEOUT_MS = 120_000;
export const ONLINE_MIGRATION_SESSION_OPTIONS =
  `-c lock_timeout=${MIGRATION_LOCK_TIMEOUT_MS}ms -c statement_timeout=${MIGRATION_STATEMENT_TIMEOUT_MS}ms`;

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

function statementAt(flat: string, index: number): string {
  const end = flat.indexOf(';', index);
  return flat.slice(index, end === -1 ? undefined : end);
}

/** Detect DDL that can block concurrent reads or writes on populated tables. */
export function lintLockingStatements(name: string, sql: string): LockingOp[] {
  const ops: LockingOp[] = [];
  const flat = sql.replace(/\n/g, ' ').replace(/\/\*.*?\*\//g, ' ');
  let match: RegExpExecArray | null;

  const createIndex = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)"?([\w."]+)"?/gi;
  while ((match = createIndex.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'create_index_without_concurrently',
      subject: match[1].replace(/"/g, ''),
    });
  }

  const addNotNull =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?[^;]*?NOT\s+NULL/gi;
  while ((match = addNotNull.exec(flat)) !== null) {
    if (!/\bDEFAULT\b/i.test(statementAt(flat, match.index))) {
      ops.push({
        migration: name,
        kind: 'add_column_not_null',
        subject: `${match[1].replace(/"/g, '')}.${match[2]}`,
      });
    }
  }

  const setNotNull =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ALTER\s+COLUMN\s+"?(\w+)"?\s+SET\s+NOT\s+NULL/gi;
  while ((match = setNotNull.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'set_not_null',
      subject: `${match[1].replace(/"/g, '')}.${match[2]}`,
    });
  }

  const addForeignKey =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ADD\s+CONSTRAINT\s+"?(\w+)"?\s+FOREIGN\s+KEY/gi;
  while ((match = addForeignKey.exec(flat)) !== null) {
    if (!/\bNOT\s+VALID\b/i.test(statementAt(flat, match.index))) {
      ops.push({
        migration: name,
        kind: 'add_foreign_key_without_not_valid',
        subject: match[2],
      });
    }
  }

  const alterType =
    /\bALTER\s+TABLE\s+"?([\w."]+)"?\s+ALTER\s+COLUMN\s+"?(\w+)"?\s+(?:TYPE|SET\s+DATA\s+TYPE)\b/gi;
  while ((match = alterType.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'alter_column_type',
      subject: `${match[1].replace(/"/g, '')}.${match[2]}`,
    });
  }

  const lockTable = /\bLOCK\s+TABLE\s+"?([\w."]+)"?/gi;
  while ((match = lockTable.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'lock_table',
      subject: match[1].replace(/"/g, ''),
    });
  }

  const dropCascade = /\bDROP\s+(?:TABLE|VIEW|COLUMN|CONSTRAINT|INDEX)\b[^;]*?\bCASCADE\b/gi;
  while ((match = dropCascade.exec(flat)) !== null) {
    ops.push({
      migration: name,
      kind: 'drop_cascade',
      subject: match[0].trim().slice(0, 60),
    });
  }

  return ops;
}
