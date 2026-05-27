import { anonymizationService } from '../services/anonymizationService.js';
import logger from '../utils/logger.js';

/**
 * This script is intended to be run by a system cron (e.g. crontab)
 * or triggered by a job scheduler like BullMQ.
 */
async function runJob() {
  try {
    await anonymizationService.performAnonymization();
    logger.info('Anonymization cron job completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error('Anonymization cron job failed:', error);
    process.exit(1);
  }
}

runJob();
