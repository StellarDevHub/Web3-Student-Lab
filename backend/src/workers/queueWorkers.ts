/**
 * Standalone entrypoint for the BullMQ workers managed by QueueManager
 * (BE-006 / BE-010). Runs separately from the API so CPU-heavy evaluation and
 * rate-limited minting never compete with request handling:
 *
 *   npm run workers:queues        (development, via tsx)
 *   npm run start:workers         (production, compiled output)
 *
 * The dead-letter queue intentionally has no consumer; it is drained only
 * through the admin API (/api/v1/admin/queues/dlq).
 */

import { getQueueManager, type QueueManager } from '../queues/queueManager.js';
import {
  computeDlqRetryDelayMs,
  DLQ_RETRY_ATTEMPTS,
  DLQ_RETRY_JITTER,
  DLQ_RETRY_SCHEDULE_MS,
  DLQ_RETRY_WINDOW_MS,
  DLQ_TOTAL_ATTEMPTS,
} from '../queues/retryPolicy.js';
import logger from '../utils/logger.js';
import { startEvaluationWorker, stopEvaluationWorker } from './evaluationWorker.js';
import { startMintingWorker, stopMintingWorker } from './mintingWorker.js';

export {
  computeDlqRetryDelayMs,
  DLQ_RETRY_ATTEMPTS,
  DLQ_RETRY_JITTER,
  DLQ_RETRY_SCHEDULE_MS,
  DLQ_RETRY_WINDOW_MS,
  DLQ_TOTAL_ATTEMPTS,
};

export function startQueueWorkers(manager: QueueManager = getQueueManager()): void {
  startMintingWorker(manager);
  startEvaluationWorker(manager);
}

export async function stopQueueWorkers(): Promise<void> {
  await Promise.allSettled([stopMintingWorker(), stopEvaluationWorker()]);
  await getQueueManager().close();
}

const isEntrypoint = /queueWorkers\.(ts|js)$/.test(process.argv[1] ?? '');

if (isEntrypoint) {
  startQueueWorkers();
  const shutdown = (signal: string) => {
    logger.info(`[queueWorkers] ${signal} received; draining workers`);
    stopQueueWorkers().finally(() => process.exit(0));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
