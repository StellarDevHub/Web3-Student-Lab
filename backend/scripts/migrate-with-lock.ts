/**
 * CLI entry: `npm run migrate:locked` or `npm run migration:deploy:locked`
 * Distributed lock, pending-DDL safety scan, and online timeouts for operators and CI.
 */
import { runStartupMigrations } from '../src/db/startupMigrations.js';

runStartupMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
