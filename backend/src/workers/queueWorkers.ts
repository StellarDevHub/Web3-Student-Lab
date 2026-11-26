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
import { startTracing } from '../instrumentation.js';
import { QUEUE_FAILOVER_BUDGET_MS } from '../config/redis.js';
import logger from '../utils/logger.js';
import { startEvaluationWorker, stopEvaluationWorker } from './evaluationWorker.js';
import { startMintingWorker, stopMintingWorker } from './mintingWorker.js';
import { startVideoTranscodingWorker, stopVideoTranscodingWorker } from './videoTranscodingWorker.js';

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
  startVideoTranscodingWorker();
}

export async function stopQueueWorkers(): Promise<void> {
  await Promise.allSettled([stopMintingWorker(), stopEvaluationWorker(), stopVideoTranscodingWorker()]);
  await getQueueManager().close();
}

const isEntrypoint = /queueWorkers\.(ts|js)$/.test(process.argv[1] ?? '');

if (isEntrypoint) {
  // Start the OTLP exporter before consuming any jobs so every job span is
  // exported. startTracing() is idempotent and a no-op when OTEL_SDK_DISABLED=true.
  void startTracing().then(() => {
    const manager = getQueueManager();
    logger.info('[queueWorkers] Redis queue topology resolved', {
      ...manager.getRedisTopology(),
      failoverBudgetMs: QUEUE_FAILOVER_BUDGET_MS,
    });
    startQueueWorkers();
  });
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
