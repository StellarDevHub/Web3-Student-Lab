/**
 * Apply Prisma migrations while holding the global distributed migration lock
 * (#1419 / BE-HARD-28). Only one node / CI job may run this at a time.
 *
 * Usage: npm run migration:deploy:locked
 */

import { spawnSync } from 'child_process';
import { runWithMigrationLock } from '../src/db/migrationLock.js';
import logger from '../src/utils/logger.js';

async function main(): Promise<void> {
  await runWithMigrationLock(async () => {
    const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      shell: true,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`prisma migrate deploy exited with code ${result.status ?? 'unknown'}`);
    }
  });

  logger.info('Prisma migrations applied under distributed lock');
}

main().catch((error) => {
  logger.error('Locked migration run failed', error);
  process.exit(1);
});
