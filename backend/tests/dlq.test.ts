import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  calculateExponentialBackoffWithJitter,
  calculateLinearBackoffWithJitter,
  enqueueToDLQ,
  getDLQMetrics,
  inspectDLQ,
  purgeDLQ,
  replayAllDLQJobs,
  replayDLQJob,
  resetDLQStore,
} from '../src/services/dlq.service.js';

describe('DLQ & Retry Service', () => {
  beforeEach(() => {
    resetDLQStore();
  });

  describe('Backoff Calculations', () => {
    it('calculates exponential backoff with jitter', () => {
      const delay1 = calculateExponentialBackoffWithJitter(1, 1000, 30000, 0.2);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1200);

      const delay2 = calculateExponentialBackoffWithJitter(3, 1000, 30000, 0.2);
      // 1000 * 2^2 = 4000
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(4800);
    });

    it('calculates linear backoff with jitter', () => {
      const delay1 = calculateLinearBackoffWithJitter(1, 1000, 30000, 0.2);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1200);

      const delay2 = calculateLinearBackoffWithJitter(3, 1000, 30000, 0.2);
      // 1000 * 3 = 3000
      expect(delay2).toBeGreaterThanOrEqual(3000);
      expect(delay2).toBeLessThanOrEqual(3600);
    });
  });

  describe('DLQ Store Operations', () => {
    it('enqueues failed jobs and preserves payload and traceId', async () => {
      const record = await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'certificate.minted',
        data: { deliveryId: 'del_100', event: { id: 'evt_100', type: 'certificate.minted' } },
        opts: { attempts: 5 },
        error: 'Network timeout',
        traceId: 'trace_100',
        attemptsMade: 5,
      });

      expect(record.dlqId).toBeDefined();
      expect(record.traceId).toBe('trace_100');
      expect(record.originalQueue).toBe('webhook-delivery');
      expect(record.attemptsMade).toBe(5);

      const inspected = await inspectDLQ();
      expect(inspected).toHaveLength(1);
      expect(inspected[0]?.dlqId).toBe(record.dlqId);
    });

    it('filters inspect results by queue and limit', async () => {
      await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'event.one',
        data: {},
        error: 'err 1',
        attemptsMade: 5,
      });
      await enqueueToDLQ({
        originalQueue: 'export-queue',
        jobName: 'export.job',
        data: {},
        error: 'err 2',
        attemptsMade: 3,
      });

      const webhooksOnly = await inspectDLQ({ queue: 'webhook-delivery' });
      expect(webhooksOnly).toHaveLength(1);
      expect(webhooksOnly[0]?.originalQueue).toBe('webhook-delivery');

      const limited = await inspectDLQ({ limit: 1 });
      expect(limited).toHaveLength(1);
    });

    it('tracks metrics and triggers alert status when count exceeds threshold', async () => {
      const initialMetrics = await getDLQMetrics();
      expect(initialMetrics.isAlerting).toBe(false);

      for (let i = 0; i < 11; i++) {
        await enqueueToDLQ({
          originalQueue: 'webhook-delivery',
          jobName: `job_${i}`,
          data: {},
          error: 'failure',
          attemptsMade: 5,
        });
      }

      const metrics = await getDLQMetrics();
      expect(metrics.totalCount).toBe(11);
      expect(metrics.isAlerting).toBe(true);
      expect(metrics.perQueue['webhook-delivery']).toBe(11);
    });

    it('replays a single DLQ job and removes it from DLQ', async () => {
      const record = await enqueueToDLQ({
        originalQueue: 'export-queue',
        jobName: 'export-job',
        data: { type: 'students', format: 'csv' },
        error: 'Export failed',
        traceId: 'trace_export_1',
        attemptsMade: 3,
      });

      const replayResult = await replayDLQJob(record.dlqId);
      expect(replayResult.success).toBe(true);
      expect(replayResult.replayedJobId).toBeDefined();

      const remaining = await inspectDLQ();
      expect(remaining).toHaveLength(0);
    });

    it('replays all DLQ jobs for a specific queue', async () => {
      await enqueueToDLQ({
        originalQueue: 'export-queue',
        jobName: 'export-job-1',
        data: {},
        error: 'err 1',
        attemptsMade: 3,
      });
      await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'webhook-job-1',
        data: {},
        error: 'err 2',
        attemptsMade: 5,
      });

      const result = await replayAllDLQJobs('export-queue');
      expect(result.replayedCount).toBe(1);

      const remaining = await inspectDLQ();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.originalQueue).toBe('webhook-delivery');
    });

    it('purges DLQ messages', async () => {
      await enqueueToDLQ({
        originalQueue: 'export-queue',
        jobName: 'job-1',
        data: {},
        error: 'err',
        attemptsMade: 3,
      });
      await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'job-2',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const purgeResult = await purgeDLQ('export-queue');
      expect(purgeResult.purgedCount).toBe(1);

      const remaining = await inspectDLQ();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.originalQueue).toBe('webhook-delivery');
    });
  });
});
