/**
 * Database schema migration lock (#1419 / BE-HARD-28 & #1389).
 *
 * Wraps the migration runner in a global distributed lock so that only a
 * single backend node / CI job can apply schema changes at any instant.
 */

import {
  lockManager,
  MIGRATION_LOCK_KEY,
  type DistributedLockManager,
  type LockOptions,
} from '../lib/lock/index.js';

export { MIGRATION_LOCK_KEY };
export const DEFAULT_MIGRATION_LOCK_TTL_MS = 10 * 60_000;

export interface MigrationLockOptions extends Partial<LockOptions> {
  /** Inject a lock manager (used in tests). */
  manager?: DistributedLockManager;
  key?: string;
  ttlMs?: number;
  retryMs?: number;
  /** Upper bound a waiter will spin before giving up. Prevents deadlock. */
  waitTimeoutMs?: number;
  token?: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Execute `fn` while holding the global schema-migration lock. Defaults to no
 * retries so a second runner fails fast instead of queueing behind a long
 * migration.
 */
export async function runWithMigrationLock<T>(
  fn: () => Promise<T>,
  options: MigrationLockOptions = {},
): Promise<T> {
  const { manager, ...lockOptions } = options;
  const locks = manager ?? lockManager;
  return locks.withLock(
    MIGRATION_LOCK_KEY,
    {
      ttlMs: DEFAULT_MIGRATION_LOCK_TTL_MS,
      retryCount: 0,
      autoExtend: true,
      ...lockOptions,
    },
    fn,
  );
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface MigrationLockClient {
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMs: number,
    setMode: 'NX'
  ): Promise<'OK' | null>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export class MigrationLockTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationLockTimeoutError';
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireMigrationLock(
  client: MigrationLockClient,
  options: MigrationLockOptions = {}
): Promise<{ token: string; release: () => Promise<void>; extend: () => Promise<boolean> }> {
  const key = options.key ?? MIGRATION_LOCK_KEY;
  const ttlMs = options.ttlMs ?? 120_000;
  const retryMs = options.retryMs ?? 250;
  const waitTimeoutMs = options.waitTimeoutMs ?? 10 * 60_000;
  const token = options.token ?? `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadline = now() + waitTimeoutMs;

  while (now() < deadline) {
    const acquired = await client.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      return {
        token,
        extend: async () => {
          const refreshed = await client.eval(EXTEND_SCRIPT, 1, key, token, String(ttlMs));
          return Number(refreshed) === 1;
        },
        release: async () => {
          await client.eval(RELEASE_SCRIPT, 1, key, token);
        },
      };
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const jitter = Math.floor(Math.random() * Math.min(retryMs, 100));
    await sleep(Math.min(retryMs + jitter, remaining));
  }

  throw new MigrationLockTimeoutError(
    `timed out after ${waitTimeoutMs}ms waiting for migration lock ${key}`
  );
}

export async function withMigrationLock<T>(
  client: MigrationLockClient,
  fn: (lock: { extend: () => Promise<boolean> }) => Promise<T>,
  options: MigrationLockOptions = {}
): Promise<T> {
  const lock = await acquireMigrationLock(client, options);
  const ttlMs = options.ttlMs ?? 120_000;
  const heartbeat = setInterval(() => {
    void lock.extend().catch(() => undefined);
  }, Math.max(1000, Math.floor(ttlMs / 3)));
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  try {
    return await fn(lock);
  } finally {
    clearInterval(heartbeat);
    await lock.release();
  }
}
