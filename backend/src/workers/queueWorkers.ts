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

import { getQueueManager } from '../queues/queueManager.js';
import { QUEUE_FAILOVER_BUDGET_MS } from '../config/redis.js';
import logger from '../utils/logger.js';
import { startEvaluationWorker, stopEvaluationWorker } from './evaluationWorker.js';
import { startMintingWorker, stopMintingWorker } from './mintingWorker.js';
import { startVideoTranscodingWorker, stopVideoTranscodingWorker } from './videoTranscodingWorker.js';

export function startQueueWorkers(): void {
  startMintingWorker();
  startEvaluationWorker();
  startVideoTranscodingWorker();
}

export async function stopQueueWorkers(): Promise<void> {
  await Promise.allSettled([stopMintingWorker(), stopEvaluationWorker(), stopVideoTranscodingWorker()]);
  await getQueueManager().close();
}

const isEntrypoint = /queueWorkers\.(ts|js)$/.test(process.argv[1] ?? '');

if (isEntrypoint) {
  const manager = getQueueManager();
  // Log the resolved topology (never credentials) so a deployment can be
  // verified to be talking to Sentinel/Cluster rather than a single node.
  logger.info('[queueWorkers] Redis queue topology resolved', {
    ...manager.getRedisTopology(),
    failoverBudgetMs: QUEUE_FAILOVER_BUDGET_MS,
  });

  startQueueWorkers();
  const shutdown = (signal: string) => {
    logger.info(`[queueWorkers] ${signal} received; draining workers`);
    stopQueueWorkers().finally(() => {
      logger.info('[queueWorkers] Redis queue failover stats', manager.getQueueFailoverStats());
      process.exit(0);
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
