/**
 * Dead-Letter Queue Processor — BE-006
 *
 * Receives jobs whose retries are exhausted (or that failed with BullMQ's
 * `UnrecoverableError`) from any queue managed by `QueueManager`, parks a
 * full copy of them in the durable `dead-letter` BullMQ queue, and raises
 * alerts. The DLQ queue intentionally has no consumer: entries stay in the
 * waiting list until an operator replays or purges them through the admin
 * API.
 *
 * Alerts fire for every dead-lettered job (structured `logger.error`, plus a
 * POST to `DLQ_ALERT_WEBHOOK_URL` when configured) and, separately, once the
 * DLQ depth crosses `DLQ_ALERT_THRESHOLD` — throttled so a failure storm
 * produces one page, not thousands.
 */

import type { Job, JobsOptions, Queue } from 'bullmq';
import logger from '../utils/logger.js';

export const DEAD_LETTER_QUEUE_NAME = 'dead-letter';

export interface DeadLetterJobData {
  sourceQueue: string;
  sourceJobId: string;
  jobName: string;
  data: Record<string, unknown>;
  opts: Pick<JobsOptions, 'attempts' | 'priority' | 'backoff'>;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  failedAt: string;
  userId?: string;
}

export interface DeadLetterEntry extends DeadLetterJobData {
  id: string;
}

export interface DlqAlert {
  kind: 'job-dead-lettered' | 'threshold-exceeded';
  queue: string;
  message: string;
  details: Record<string, unknown>;
}

export type DlqAlertSink = (alert: DlqAlert) => Promise<void> | void;

export interface DlqProcessorOptions {
  queue: Queue<DeadLetterJobData>;
  resolveSourceQueue: (name: string) => Queue | undefined;
  alert?: DlqAlertSink;
  alertThreshold?: number;
  thresholdAlertCooldownMs?: number;
  now?: () => number;
}

const DLQ_LIST_STATES = ['waiting', 'paused'] as const;

/** BullMQ forbids ':' in custom job ids. */
const deadLetterId = (sourceQueue: string, jobId: string) => `${sourceQueue}--${jobId}`.replace(/:/g, '_');

/**
 * Default alert sink: always logs; additionally POSTs to a webhook (e.g. a
 * Slack/PagerDuty bridge) when `DLQ_ALERT_WEBHOOK_URL` is set.
 */
export const defaultDlqAlertSink: DlqAlertSink = async (alert) => {
  logger.error(`[DLQ] ${alert.message}`, { kind: alert.kind, queue: alert.queue, ...alert.details });

  const url = process.env.DLQ_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: alert.message, ...alert }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      logger.warn('[DLQ] Alert webhook responded with non-2xx', { status: response.status });
    }
  } catch (err) {
    logger.warn('[DLQ] Alert webhook delivery failed', { error: err instanceof Error ? err.message : String(err) });
  }
};

export class DlqProcessor {
  private readonly queue: Queue<DeadLetterJobData>;
  private readonly resolveSourceQueue: (name: string) => Queue | undefined;
  private readonly alert: DlqAlertSink;
  private readonly alertThreshold: number;
  private readonly thresholdAlertCooldownMs: number;
  private readonly now: () => number;
  private lastThresholdAlertAt = Number.NEGATIVE_INFINITY;

  constructor(options: DlqProcessorOptions) {
    this.queue = options.queue;
    this.resolveSourceQueue = options.resolveSourceQueue;
    this.alert = options.alert ?? defaultDlqAlertSink;
    this.alertThreshold = options.alertThreshold ?? (Number(process.env.DLQ_ALERT_THRESHOLD) || 10);
    this.thresholdAlertCooldownMs = options.thresholdAlertCooldownMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * A failure is terminal when BullMQ will not retry it: the job has been
   * moved to the failed set (`finishedOn` is only stamped then), it used up
   * its attempts, or the processor declared it unrecoverable.
   */
  static isTerminalFailure(job: Pick<Job, 'finishedOn' | 'attemptsMade' | 'opts'>, err?: Error): boolean {
    if (err?.name === 'UnrecoverableError') return true;
    if (job.finishedOn) return true;
    return job.attemptsMade >= (job.opts.attempts ?? 1);
  }

  /** Called from every managed worker's `failed` event. No-op for failures that will be retried. */
  async handleFailure(sourceQueue: string, job: Job, err?: Error): Promise<boolean> {
    if (!DlqProcessor.isTerminalFailure(job, err)) return false;

    const data = (job.data ?? {}) as Record<string, unknown>;
    const entry: DeadLetterJobData = {
      sourceQueue,
      sourceJobId: String(job.id),
      jobName: job.name,
      data,
      opts: {
        ...(job.opts.attempts !== undefined ? { attempts: job.opts.attempts } : {}),
        ...(job.opts.priority !== undefined ? { priority: job.opts.priority } : {}),
        ...(job.opts.backoff !== undefined ? { backoff: job.opts.backoff } : {}),
      },
      failedReason: err?.message ?? job.failedReason ?? 'unknown error',
      stacktrace: (job.stacktrace ?? []).slice(-5),
      attemptsMade: job.attemptsMade,
      failedAt: new Date(this.now()).toISOString(),
      ...(typeof data.userId === 'string' ? { userId: data.userId } : {}),
    };

    await this.queue.add(job.name, entry, {
      jobId: deadLetterId(sourceQueue, String(job.id)),
      removeOnComplete: true,
      removeOnFail: false,
    });

    await this.raise({
      kind: 'job-dead-lettered',
      queue: sourceQueue,
      message: `Job ${job.name}#${job.id} on '${sourceQueue}' moved to the DLQ after ${job.attemptsMade} attempt(s): ${entry.failedReason}`,
      details: { jobId: job.id, jobName: job.name, attemptsMade: job.attemptsMade, userId: entry.userId },
    });
    await this.checkThreshold(sourceQueue);
    return true;
  }

  private async checkThreshold(sourceQueue: string): Promise<void> {
    const depth = await this.depth();
    const now = this.now();
    if (depth < this.alertThreshold || now - this.lastThresholdAlertAt < this.thresholdAlertCooldownMs) return;
    this.lastThresholdAlertAt = now;
    await this.raise({
      kind: 'threshold-exceeded',
      queue: sourceQueue,
      message: `Dead-letter queue depth is ${depth} (threshold ${this.alertThreshold}).`,
      details: { depth, threshold: this.alertThreshold },
    });
  }

  private async raise(alert: DlqAlert): Promise<void> {
    try {
      await this.alert(alert);
    } catch (err) {
      logger.warn('[DLQ] Alert sink threw', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async depth(): Promise<number> {
    const counts = await this.queue.getJobCounts(...DLQ_LIST_STATES);
    return Object.values(counts).reduce((sum, n) => sum + n, 0);
  }

  private toEntry(job: Job<DeadLetterJobData>): DeadLetterEntry {
    return { id: String(job.id), ...job.data };
  }

  async list(filter: { sourceQueue?: string; offset?: number; limit?: number } = {}): Promise<{
    total: number;
    entries: DeadLetterEntry[];
  }> {
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = Math.min(Math.max(1, filter.limit ?? 50), 500);

    if (!filter.sourceQueue) {
      const [jobs, total] = await Promise.all([
        this.queue.getJobs([...DLQ_LIST_STATES], offset, offset + limit - 1, true),
        this.depth(),
      ]);
      return { total, entries: jobs.filter(Boolean).map((job) => this.toEntry(job)) };
    }

    const all = (await this.queue.getJobs([...DLQ_LIST_STATES], 0, -1, true))
      .filter(Boolean)
      .filter((job) => job.data.sourceQueue === filter.sourceQueue);
    return { total: all.length, entries: all.slice(offset, offset + limit).map((job) => this.toEntry(job)) };
  }

  async get(id: string): Promise<DeadLetterEntry | null> {
    const job = await this.queue.getJob(id);
    return job ? this.toEntry(job) : null;
  }

  /**
   * Re-enqueues the original job on its source queue with a fresh retry
   * budget, then removes it from the DLQ.
   */
  async replay(id: string): Promise<{ id: string; replayedJobId: string; sourceQueue: string } | null> {
    const job = await this.queue.getJob(id);
    if (!job) return null;

    const source = this.resolveSourceQueue(job.data.sourceQueue);
    if (!source) {
      throw new Error(`Source queue '${job.data.sourceQueue}' is not managed; cannot replay.`);
    }

    const replayed = await source.add(job.data.jobName, job.data.data, job.data.opts);
    await job.remove();
    logger.info('[DLQ] Replayed dead-lettered job', {
      dlqId: id,
      sourceQueue: job.data.sourceQueue,
      replayedJobId: replayed.id,
    });
    return { id, replayedJobId: String(replayed.id), sourceQueue: job.data.sourceQueue };
  }

  async replayAll(sourceQueue?: string): Promise<{ replayed: number; failed: Array<{ id: string; error: string }> }> {
    const jobs = (await this.queue.getJobs([...DLQ_LIST_STATES], 0, -1, true))
      .filter(Boolean)
      .filter((job) => !sourceQueue || job.data.sourceQueue === sourceQueue);

    let replayed = 0;
    const failed: Array<{ id: string; error: string }> = [];
    for (const job of jobs) {
      try {
        if (await this.replay(String(job.id))) replayed++;
      } catch (err) {
        failed.push({ id: String(job.id), error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { replayed, failed };
  }

  async purge(id: string): Promise<boolean> {
    const job = await this.queue.getJob(id);
    if (!job) return false;
    await job.remove();
    return true;
  }

  async purgeAll(sourceQueue?: string): Promise<{ purged: number }> {
    const jobs = (await this.queue.getJobs([...DLQ_LIST_STATES], 0, -1, true))
      .filter(Boolean)
      .filter((job) => !sourceQueue || job.data.sourceQueue === sourceQueue);
    await Promise.all(jobs.map((job) => job.remove()));
    logger.warn('[DLQ] Purged dead-lettered jobs', { count: jobs.length, sourceQueue: sourceQueue ?? 'all' });
    return { purged: jobs.length };
  }
}
