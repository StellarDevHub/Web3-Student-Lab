/**
 * CLI entry: `npm run migrate:locked` or `npm run migration:deploy:locked`
 * Distributed lock the API uses on startup, for operators and CI.
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
