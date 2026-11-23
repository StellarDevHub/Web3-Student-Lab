import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import {
  enqueueToDLQ,
  inspectDLQ,
  getDLQMetrics,
  replayDLQJob,
  replayAllDLQJobs,
  purgeDLQ,
  resetDLQStore,
} from '../src/services/dlq.service.js';
import { handleStorageFailure } from '../src/services/storage/worker.js';
import { STORAGE_PIN_QUEUE_NAME } from '../src/services/storage/queue.js';
import { MockStorageProvider } from '../src/services/storage/providers/mock.provider.js';
import { StorageService } from '../src/services/storage/storage.service.js';
import type { StoragePinJobData } from '../src/services/storage/types.js';

const makeStorageJobData = (overrides: Partial<StoragePinJobData> = {}): StoragePinJobData => ({
  resourceType: 'project',
  resourceId: 'proj-1',
  name: 'test-asset',
  kind: 'generic',
  mode: 'json',
  content: { hello: 'world' },
  ...overrides,
});

const makeMockJob = (data: StoragePinJobData, attemptsMade = 5) => ({
  id: 'job-123',
  name: 'pin-json',
  data,
  opts: { attempts: 5 },
  attemptsMade,
  attempts: 5,
});

describe('Storage Dead-Letter Queue Integration', () => {
  beforeEach(() => {
    resetDLQStore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Worker Dead-Letter Handling', () => {
    it('sends failed storage job to DLQ via handleStorageFailure', async () => {
      const job = makeMockJob(makeStorageJobData());
      const error = new Error('IPFS pinning failed');

      await handleStorageFailure(job as any, error, 'IPFS pinning failed');

      const records = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(records).toHaveLength(1);
      expect(records[0]?.originalQueue).toBe(STORAGE_PIN_QUEUE_NAME);
      expect(records[0]?.jobName).toBe('pin-json');
      expect(records[0]?.error).toBe('IPFS pinning failed');
    });

    it('preserves job data in DLQ record', async () => {
      const jobData = makeStorageJobData({
        resourceType: 'certificate',
        resourceId: 'cert-42',
        name: 'cert-image',
        kind: 'certificate-image',
      });
      const job = makeMockJob(jobData);

      await handleStorageFailure(job as any, new Error('timeout'), 'timeout');

      const records = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(records[0]?.data.resourceType).toBe('certificate');
      expect(records[0]?.data.resourceId).toBe('cert-42');
      expect(records[0]?.data.name).toBe('cert-image');
    });

    it('preserves trace ID from job data metadata', async () => {
      const jobData = makeStorageJobData({
        metadata: { traceId: 'trace_storage_abc' },
      });
      const job = makeMockJob(jobData);

      await handleStorageFailure(job as any, new Error('fail'), 'fail');

      const records = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(records[0]?.traceId).toBe('trace_storage_abc');
    });

    it('generates trace ID from job ID when no metadata traceId', async () => {
      const job = makeMockJob(makeStorageJobData());

      await handleStorageFailure(job as any, new Error('fail'), 'fail');

      const records = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(records[0]?.traceId).toBeDefined();
      expect(records[0]?.traceId).toContain('job-123');
    });

    it('preserves attemptsMade in DLQ record', async () => {
      const job = makeMockJob(makeStorageJobData(), 3);

      await handleStorageFailure(job as any, new Error('fail'), 'fail');

      const records = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(records[0]?.attemptsMade).toBe(3);
    });
  });

  describe('Retry Lifecycle', () => {
    it('stores terminal failure with error message', async () => {
      const record = await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: { resourceType: 'project', resourceId: 'p1', name: 'idea', mode: 'json', content: {} },
        error: 'Connection refused',
        traceId: 'trace_p1',
        attemptsMade: 5,
      });

      expect(record.error).toBe('Connection refused');
      expect(record.attemptsMade).toBe(5);
      expect(record.failedAt).toBeDefined();
    });

    it('persists retry count across enqueues', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-file',
        data: {},
        error: 'err1',
        attemptsMade: 2,
      });
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-file',
        data: {},
        error: 'err2',
        attemptsMade: 4,
      });

      const records = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(records).toHaveLength(2);
      const attempts = records.map(r => r.attemptsMade).sort();
      expect(attempts).toEqual([2, 4]);
    });
  });

  describe('Replay Authorization & Idempotency', () => {
    it('returns error for non-existent DLQ id', async () => {
      const result = await replayDLQJob('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('replays a storage DLQ job and removes it from DLQ', async () => {
      const record = await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: { resourceType: 'project', resourceId: 'p1', name: 'idea', mode: 'json', content: {} },
        error: 'Failed',
        traceId: 'trace_replay',
        attemptsMade: 5,
      });

      const result = await replayDLQJob(record.dlqId);
      expect(result.success).toBe(true);
      expect(result.replayedJobId).toBeDefined();

      const remaining = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(remaining).toHaveLength(0);
    });

    it('replays all storage DLQ jobs', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err1',
        attemptsMade: 5,
      });
      await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'webhook',
        data: {},
        error: 'err2',
        attemptsMade: 5,
      });

      const result = await replayAllDLQJobs(STORAGE_PIN_QUEUE_NAME);
      expect(result.replayedCount).toBe(1);

      const remaining = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(remaining).toHaveLength(0);

      const allRemaining = await inspectDLQ();
      expect(allRemaining).toHaveLength(1);
      expect(allRemaining[0]?.originalQueue).toBe('webhook-delivery');
    });

    it('replay of non-existent id does not affect other records', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const result = await replayDLQJob('does-not-exist');
      expect(result.success).toBe(false);

      const remaining = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(remaining).toHaveLength(1);
    });
  });

  describe('Metrics', () => {
    it('returns zero metrics when empty', async () => {
      const metrics = await getDLQMetrics();
      expect(metrics.totalCount).toBe(0);
      expect(metrics.isAlerting).toBe(false);
    });

    it('counts storage jobs in metrics', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-file',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const metrics = await getDLQMetrics();
      expect(metrics.totalCount).toBe(2);
      expect(metrics.perQueue[STORAGE_PIN_QUEUE_NAME]).toBe(2);
    });

    it('alerts when total count exceeds threshold', async () => {
      process.env.DLQ_ALERT_THRESHOLD = '2';
      for (let i = 0; i < 3; i++) {
        await enqueueToDLQ({
          originalQueue: STORAGE_PIN_QUEUE_NAME,
          jobName: `job_${i}`,
          data: {},
          error: 'err',
          attemptsMade: 5,
        });
      }

      const metrics = await getDLQMetrics();
      expect(metrics.isAlerting).toBe(true);
      expect(metrics.totalCount).toBe(3);

      delete process.env.DLQ_ALERT_THRESHOLD;
    });
  });

  describe('Purge', () => {
    it('purges storage DLQ jobs only', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });
      await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'webhook',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const result = await purgeDLQ(STORAGE_PIN_QUEUE_NAME);
      expect(result.purgedCount).toBe(1);

      const remaining = await inspectDLQ();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.originalQueue).toBe('webhook-delivery');
    });

    it('purges all when no queue specified', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });
      await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'webhook',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const result = await purgeDLQ();
      expect(result.purgedCount).toBe(2);

      const remaining = await inspectDLQ();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('Filtering', () => {
    it('filters DLQ records by storage queue', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });
      await enqueueToDLQ({
        originalQueue: 'webhook-delivery',
        jobName: 'webhook',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const storageOnly = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME });
      expect(storageOnly).toHaveLength(1);
      expect(storageOnly[0]?.originalQueue).toBe(STORAGE_PIN_QUEUE_NAME);
    });

    it('respects limit filter', async () => {
      for (let i = 0; i < 5; i++) {
        await enqueueToDLQ({
          originalQueue: STORAGE_PIN_QUEUE_NAME,
          jobName: `job_${i}`,
          data: {},
          error: 'err',
          attemptsMade: 5,
        });
      }

      const limited = await inspectDLQ({ queue: STORAGE_PIN_QUEUE_NAME, limit: 3 });
      expect(limited).toHaveLength(3);
    });
  });

  describe('StorageService DLQ Methods', () => {
    const createRepository = (): NonNullable<ConstructorParameters<typeof StorageService>[0]>['repository'] => ({
      upsertStorageAsset: jest.fn(),
      markAssetFailed: jest.fn(),
      listUnreferencedAssets: jest.fn(),
      markAssetUnpinned: jest.fn(),
      markAssetsUnreferenced: jest.fn(),
    });

    it('getDlqRecords returns storage DLQ records', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const svc = new StorageService({ provider: new MockStorageProvider(), repository: createRepository() });
      const records = await svc.getDlqRecords();
      expect(records).toHaveLength(1);
      expect(records[0]?.originalQueue).toBe(STORAGE_PIN_QUEUE_NAME);
    });

    it('getDlqRecords respects limit', async () => {
      for (let i = 0; i < 3; i++) {
        await enqueueToDLQ({
          originalQueue: STORAGE_PIN_QUEUE_NAME,
          jobName: `job_${i}`,
          data: {},
          error: 'err',
          attemptsMade: 5,
        });
      }

      const svc = new StorageService({ provider: new MockStorageProvider(), repository: createRepository() });
      const records = await svc.getDlqRecords({ limit: 2 });
      expect(records).toHaveLength(2);
    });

    it('getDlqMetrics returns metrics', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const svc = new StorageService({ provider: new MockStorageProvider(), repository: createRepository() });
      const metrics = await svc.getDlqMetrics();
      expect(metrics.totalCount).toBe(1);
      expect(metrics.perQueue[STORAGE_PIN_QUEUE_NAME]).toBe(1);
    });

    it('replayDlqJob replays a storage DLQ job', async () => {
      const record = await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: { resourceType: 'project', resourceId: 'p1', name: 'idea', mode: 'json', content: {} },
        error: 'Failed',
        traceId: 'trace_test',
        attemptsMade: 5,
      });

      const svc = new StorageService({ provider: new MockStorageProvider(), repository: createRepository() });
      const result = await svc.replayDlqJob(record.dlqId);
      expect(result.success).toBe(true);
      expect(result.replayedJobId).toBeDefined();
    });

    it('replayAllDlqJobs replays all storage DLQ jobs', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-file',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const svc = new StorageService({ provider: new MockStorageProvider(), repository: createRepository() });
      const result = await svc.replayAllDlqJobs();
      expect(result.replayedCount).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('purgeDlq purges storage DLQ records', async () => {
      await enqueueToDLQ({
        originalQueue: STORAGE_PIN_QUEUE_NAME,
        jobName: 'pin-json',
        data: {},
        error: 'err',
        attemptsMade: 5,
      });

      const svc = new StorageService({ provider: new MockStorageProvider(), repository: createRepository() });
      const result = await svc.purgeDlq();
      expect(result.purgedCount).toBe(1);

      const remaining = await svc.getDlqRecords();
      expect(remaining).toHaveLength(0);
    });

    it('replayDlqJob returns error for non-existent id', async () => {
      const svc = new StorageService({ provider: new MockStorageProvider(), repository: createRepository() });
      const result = await svc.replayDlqJob('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
