/**
 * BullMQ queue-depth sampling for the Prometheus exporter (BE-077).
 *
 * Scrapes are cheap: the waiting-job counts are refreshed from the queue
 * manager at most once every `PROMETHEUS_QUEUE_METRICS_TTL_MS` (default 10s)
 * and cached in the gauge. A scrape never blocks on an unreachable Redis for
 * longer than `PROMETHEUS_QUEUE_METRICS_TIMEOUT_MS` (default 1.5s); on failure
 * the last known values stay in place and the stale sample is reported by its
 * age instead of the exporter hanging or failing the scrape.
 */

import { getQueueManager } from '../queues/queueManager.js';
import logger from '../utils/logger.js';
import { bullmqQueueWaitingJobsCount } from './prometheusMetrics.js';

export interface QueueWaitingCount {
  queue: string;
  waiting: number;
}

export type QueueDepthLoader = () => Promise<QueueWaitingCount[]>;

const DEFAULT_TTL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 1_500;

function envPositive(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads waiting counts from the shared queue manager (managed queues + DLQ). */
export const defaultQueueDepthLoader: QueueDepthLoader = async () => {
  const stats = await getQueueManager().getStats();
  return stats.map((entry) => ({
    queue: entry.queue,
    waiting: Number(entry.counts.waiting ?? 0),
  }));
};

let queueDepthLoader: QueueDepthLoader = defaultQueueDepthLoader;
let lastRefreshAt = 0;
let inFlight: Promise<void> | null = null;

/** Test/monitoring hook: replace or restore the queue stats source. */
export function setQueueDepthLoader(loader?: QueueDepthLoader): void {
  queueDepthLoader = loader ?? defaultQueueDepthLoader;
  lastRefreshAt = 0;
}

/** Timestamp (epoch ms) of the last successful queue sample, 0 if never. */
export function getLastQueueMetricsRefresh(): number {
  return lastRefreshAt;
}

/**
 * Refresh `bullmq_queue_waiting_jobs_count`. Concurrent callers share one
 * in-flight refresh so a burst of scrapes cannot fan out into a burst of
 * Redis round-trips.
 */
export async function refreshBullmqQueueMetrics(
  options: { force?: boolean; timeoutMs?: number } = {}
): Promise<void> {
  const ttlMs = envPositive('PROMETHEUS_QUEUE_METRICS_TTL_MS', DEFAULT_TTL_MS);
  if (!options.force && lastRefreshAt > 0 && Date.now() - lastRefreshAt < ttlMs) {
    return;
  }
  if (inFlight) return inFlight;

  const timeoutMs = options.timeoutMs ?? envPositive('PROMETHEUS_QUEUE_METRICS_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);

  inFlight = (async () => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const counts = await Promise.race([
        queueDepthLoader(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`queue stats timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
          timer.unref?.();
        }),
      ]);

      for (const { queue, waiting } of counts) {
        bullmqQueueWaitingJobsCount.set({ queue }, Number.isFinite(waiting) ? waiting : 0);
      }
      lastRefreshAt = Date.now();
    } catch (error) {
      // Keep the last known values; record the attempt so a down Redis does
      // not add the timeout to every single scrape.
      lastRefreshAt = Date.now();
      logger.warn('[prometheus] Unable to refresh BullMQ queue depth', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (timer) clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}
