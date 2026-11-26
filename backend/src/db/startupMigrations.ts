import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Ioredis from 'ioredis';
// @ts-ignore pg does not ship declarations in this backend setup.
import pg from 'pg';
import logger from '../utils/logger.js';
import { markMigrationsApplied } from './readinessMonitor.js';
import { MigrationLockClient, withMigrationLock } from './migrationLock.js';
import {
  lintLockingStatements,
  ONLINE_MIGRATION_SESSION_OPTIONS,
} from './migrationSafety.js';

const { Client } = pg;

function getBackendRoot(): string {
  if (process.env.BACKEND_ROOT) return process.env.BACKEND_ROOT;
  const cwd = process.cwd();
  if (fs.existsSync(path.resolve(cwd, 'prisma/schema.prisma'))) {
    return cwd;
  }
  if (fs.existsSync(path.resolve(cwd, 'backend/prisma/schema.prisma'))) {
    return path.resolve(cwd, 'backend');
  }
  return cwd;
}

const backendRoot = getBackendRoot();

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function assertPendingMigrationsAreOnline(): Promise<void> {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) throw new Error('DATABASE_URL is required to validate pending migrations');

  let connectionUrl: URL;
  try {
    connectionUrl = new URL(configuredUrl);
  } catch {
    throw new Error('DATABASE_URL is invalid; pending migration safety could not be checked');
  }
  const schema = connectionUrl.searchParams.get('schema') || 'public';
  connectionUrl.searchParams.delete('schema');

  const client = new Client({ connectionString: connectionUrl.toString() });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const migrationsTable = `${quoteIdentifier(schema)}."_prisma_migrations"`;
    const { rows: tableRows } = await client.query(
      'SELECT to_regclass($1) IS NOT NULL AS present',
      [migrationsTable],
    );
    if (!tableRows[0]?.present) return;

    const { rows } = await client.query(
      `SELECT migration_name FROM ${migrationsTable} WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const applied = new Set<string>(
      rows.map((row: { migration_name: string }) => row.migration_name),
    );
    const migrationsDir = path.join(backendRoot, 'prisma', 'migrations');
    const pending = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !applied.has(entry.name))
      .map((entry) => entry.name);
    if (pending.length === 0) return;

    const lockingOps = pending.flatMap((migration) => {
      const file = path.join(migrationsDir, migration, 'migration.sql');
      if (!fs.existsSync(file)) return [];
      return lintLockingStatements(migration, fs.readFileSync(file, 'utf8'));
    });
    if (lockingOps.length > 0) {
      const details = lockingOps
        .map((op) => `- ${op.migration}: ${op.kind} (${op.subject})`)
        .join('\n');
      throw new Error(
        `Pending migrations contain DDL that can block live traffic:\n${details}\n` +
          'Use CREATE INDEX CONCURRENTLY, nullable expand columns, and NOT VALID constraints.',
      );
    }
  } finally {
    if (connected) await client.end();
  }
}

function shouldSkip(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.SKIP_STARTUP_MIGRATIONS === '1';
}

function migrationEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env.PGOPTIONS = [env.PGOPTIONS?.trim(), ONLINE_MIGRATION_SESSION_OPTIONS].filter(Boolean).join(' ');

  if (env.DATABASE_URL) {
    try {
      const databaseUrl = new URL(env.DATABASE_URL);
      const existingOptions = databaseUrl.searchParams.get('options')?.trim();
      databaseUrl.searchParams.set(
        'options',
        [existingOptions, ONLINE_MIGRATION_SESSION_OPTIONS].filter(Boolean).join(' '),
      );
      env.DATABASE_URL = databaseUrl.toString();
    } catch {
      throw new Error('DATABASE_URL is invalid; online migration timeouts could not be applied');
    }
  }

  return env;
}

function runPrismaMigrateDeploy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: backendRoot,
      env: migrationEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      logger.info(chunk.toString().trim());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy exited ${code}: ${stderr.trim()}`));
    });
  });
}

function createRedis(): MigrationLockClient {
  const RedisCtor = (Ioredis as unknown as { default?: typeof Ioredis }).default ?? Ioredis;
  if (process.env.REDIS_URL) {
    return new (RedisCtor as unknown as new (url: string) => MigrationLockClient)(process.env.REDIS_URL);
  }
  return new (RedisCtor as unknown as new (port: number, host: string) => MigrationLockClient)(
    Number(process.env.REDIS_PORT || 6379),
    process.env.REDIS_HOST || '127.0.0.1'
  );
}

/**
 * Acquire the Redis migration lock, reject unsafe pending DDL, run
 * `prisma migrate deploy` with a 500ms lock timeout, then mark the process
 * ready. Containers that lose the race wait and then no-op once current.
 */
export async function runStartupMigrations(
  client?: MigrationLockClient
): Promise<void> {
  if (shouldSkip()) {
    markMigrationsApplied(true);
    return;
  }

  markMigrationsApplied(false);
  const redis = client ?? createRedis();
  const ownsClient = !client;

  try {
    await withMigrationLock(redis, async () => {
      await assertPendingMigrationsAreOnline();
      logger.info('migration lock acquired; running prisma migrate deploy');
      await runPrismaMigrateDeploy();
      logger.info('prisma migrate deploy finished');
    });
    markMigrationsApplied(true);
  } catch (error) {
    markMigrationsApplied(false);
    logger.error('startup migrations failed', error);
    throw error;
  } finally {
    const closable = redis as unknown as { quit?: () => Promise<unknown> };
    if (ownsClient && typeof closable.quit === 'function') {
      await closable.quit().catch(() => undefined);
    }
  }
}
