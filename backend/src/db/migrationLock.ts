/**
 * Database schema migration lock (#1419 / BE-HARD-28).
 *
 * Wraps the migration runner in a global distributed lock so that only a
 * single backend node / CI job can apply schema changes at any instant. All
 * runners must go through {@link runWithMigrationLock} (see
 * `scripts/migrate-with-lock.ts`) to be mutually exclusive.
 */

import {
  lockManager,
  MIGRATION_LOCK_KEY,
  type DistributedLockManager,
  type LockOptions,
} from '../lib/lock/index.js';

export { MIGRATION_LOCK_KEY };
export const DEFAULT_MIGRATION_LOCK_TTL_MS = 10 * 60_000;

export interface MigrationLockOptions extends LockOptions {
  /** Inject a lock manager (used in tests). */
  manager?: DistributedLockManager;
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
