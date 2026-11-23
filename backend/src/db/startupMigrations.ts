import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Ioredis from 'ioredis';
import logger from '../utils/logger.js';
import { markMigrationsApplied } from './readinessMonitor.js';
import { MigrationLockClient, withMigrationLock } from './migrationLock.js';

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

function shouldSkip(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.SKIP_STARTUP_MIGRATIONS === '1';
}

function runPrismaMigrateDeploy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: backendRoot,
      env: process.env,
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
 * Acquire the Redis migration lock, run `prisma migrate deploy`, then mark
 * the process ready. Containers that lose the race wait and then no-op once
 * the schema is already current (migrate deploy is idempotent).
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
