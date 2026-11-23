/**
 * Stellar Horizon Ledger Ingestion — Issue #1418 (BE-HARD-27)
 *
 * Runs one ingestion poll tick and exits. Intended to be invoked by a
 * system cron / process supervisor on a short interval (e.g. every 10s),
 * or adapted into a long-running `HorizonLedgerIngestionWorker.start()`
 * process — see that class if continuous in-process polling is preferred
 * over external scheduling. Mirrors the existing `anonymizationCron.ts`
 * convention in this directory.
 */
import prisma from '../db/index.js';
import logger from '../utils/logger.js';
import { HorizonLedgerIngestionEngine } from './horizonLedgerIngestionEngine.js';
import { HorizonLedgerIngestionWorker } from './horizonLedgerIngestionWorker.js';

async function runJob() {
  try {
    const engine = new HorizonLedgerIngestionEngine(prisma);
    const worker = new HorizonLedgerIngestionWorker(engine);
    const result = await worker.pollOnce();

    logger.info('Horizon ledger ingestion tick completed', result);
    process.exit(0);
  } catch (error) {
    logger.error('Horizon ledger ingestion tick failed:', error);
    process.exit(1);
  }
}

runJob();
