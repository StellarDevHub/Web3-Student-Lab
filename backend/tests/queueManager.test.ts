import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { UnrecoverableError, type Queue } from 'bullmq';
import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import {
  BACKOFF_JITTER,
  defaultJobOptions,
  MAX_RETRIES,
  QUEUE_NAMES,
  QueueManager,
  QueueRateLimitError,
} from '../src/queues/queueManager.js';
import { DlqProcessor, type DlqAlert } from '../src/workers/dlqProcessor.js';

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/** Minimal in-memory stand-in for a BullMQ Queue. */
class FakeQueue {
  private seq = 0;
  readonly jobs = new Map<string, any>();
  constructor(readonly name: string) {}

  async add(name: string, data: any, opts: any = {}) {
    const id = opts.jobId ?? String(++this.seq);
    const job = {
      id,
      name,
      data,
      opts,
      remove: jest.fn(async () => {
        this.jobs.delete(id);
      }),
    };
    this.jobs.set(id, job);
    return job;
  }
  async getJob(id: string) {
    return this.jobs.get(id);
  }
  async getJobs(_states: string[], start = 0, end = -1) {
    const all = [...this.jobs.values()];
    return end < 0 ? all.slice(start) : all.slice(start, end + 1);
  }
  async getJobCounts() {
    return { waiting: this.jobs.size, paused: 0 };
  }
}

const asQueue = (q: FakeQueue) => q as unknown as Queue;

describe('QueueManager (BE-006)', () => {
  const build = () => {
    const queues = new Map<string, FakeQueue>();
    const manager = new QueueManager({
      rateLimitStore: new RedisMock() as any,
      queueFactory: (name) => {
        const q = new FakeQueue(name);
        queues.set(name, q);
        return asQueue(q);
      },
    });
    return { manager, queues };
  };

  it('defines critical, standard and low-priority queues', () => {
    const { manager } = build();
    expect(manager.definitions[QUEUE_NAMES.TX_MINTING].tier).toBe('critical');
    expect(manager.definitions[QUEUE_NAMES.IPFS_PINNING].tier).toBe('standard');
    expect(manager.definitions[QUEUE_NAMES.EMAIL_NOTIFICATIONS].tier).toBe('low');
  });

  it('caps Soroban RPC submissions with a cluster-wide limiter and bounded concurrency', () => {
    const { manager } = build();
    const minting = manager.definitions[QUEUE_NAMES.TX_MINTING];
    expect(minting.limiter).toEqual({ max: 5, duration: 1_000 });
    expect(minting.concurrency).toBeLessThanOrEqual(minting.limiter!.max);
  });

  it('gives every job 1 attempt + 5 retries with exponential backoff and jitter', () => {
    const opts = defaultJobOptions('standard');
    expect(MAX_RETRIES).toBe(5);
    expect(opts.attempts).toBe(6);
    expect(opts.backoff).toMatchObject({ type: 'exponential', jitter: BACKOFF_JITTER });
    expect(BACKOFF_JITTER).toBeGreaterThan(0);
    expect(defaultJobOptions('critical').priority).toBeLessThan(defaultJobOptions('low').priority!);
  });

  it('enqueues with the retry policy and attributes the job to the user', async () => {
    const { manager, queues } = build();
    const job = await manager.enqueue(QUEUE_NAMES.IPFS_PINNING, 'pin', { cid: 'bafy' }, { userId: 'u1' });

    const stored = queues.get(QUEUE_NAMES.IPFS_PINNING)!.jobs.get(String(job.id));
    expect(stored.data).toEqual({ cid: 'bafy', userId: 'u1' });
    expect(stored.opts).toMatchObject({ attempts: 6, backoff: { type: 'exponential' } });
  });

  it('rate-limits each user independently per queue', async () => {
    const { manager } = build();
    const { max } = manager.definitions[QUEUE_NAMES.TX_MINTING].userRateLimit;
    const now = 1_700_000_000_000;

    for (let i = 0; i < max; i++) {
      await manager.assertWithinUserRateLimit(QUEUE_NAMES.TX_MINTING, 'alice', now);
    }
    await expect(manager.assertWithinUserRateLimit(QUEUE_NAMES.TX_MINTING, 'alice', now)).rejects.toBeInstanceOf(
      QueueRateLimitError
    );
    // Other users and other queues are unaffected.
    await expect(manager.assertWithinUserRateLimit(QUEUE_NAMES.TX_MINTING, 'bob', now)).resolves.toBeUndefined();
    await expect(manager.assertWithinUserRateLimit(QUEUE_NAMES.IPFS_PINNING, 'alice', now)).resolves.toBeUndefined();
    // A new window resets the quota.
    await expect(
      manager.assertWithinUserRateLimit(QUEUE_NAMES.TX_MINTING, 'alice', now + 60_000)
    ).resolves.toBeUndefined();
  });

  it('reports retry-after on rate-limit errors', async () => {
    const { manager } = build();
    const now = 1_700_000_010_000;
    const { max } = manager.definitions[QUEUE_NAMES.TX_MINTING].userRateLimit;
    for (let i = 0; i < max; i++) await manager.assertWithinUserRateLimit(QUEUE_NAMES.TX_MINTING, 'carol', now);
    const err = await manager.assertWithinUserRateLimit(QUEUE_NAMES.TX_MINTING, 'carol', now).catch((e) => e);
    expect(err).toBeInstanceOf(QueueRateLimitError);
    expect(err.retryAfterMs).toBeGreaterThan(0);
    expect(err.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});

describe('DlqProcessor (BE-006)', () => {
  const setup = (alertThreshold = 100) => {
    const dlq = new FakeQueue('dead-letter');
    const source = new FakeQueue(QUEUE_NAMES.IPFS_PINNING);
    const alerts: DlqAlert[] = [];
    let now = 1_700_000_000_000;
    const processor = new DlqProcessor({
      queue: asQueue(dlq) as any,
      resolveSourceQueue: (name) => (name === source.name ? asQueue(source) : undefined),
      alert: (a) => {
        alerts.push(a);
      },
      alertThreshold,
      thresholdAlertCooldownMs: 60_000,
      now: () => now,
    });
    return { dlq, source, alerts, processor, advance: (ms: number) => (now += ms) };
  };

  const failedJob = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'job-1',
      name: 'pin',
      data: { cid: 'bafy', userId: 'u1' },
      opts: { attempts: 6 },
      attemptsMade: 6,
      finishedOn: Date.now(),
      failedReason: 'boom',
      stacktrace: ['Error: boom'],
      ...overrides,
    }) as any;

  it('ignores failures that BullMQ will still retry', async () => {
    const { processor, dlq, alerts } = setup();
    const moved = await processor.handleFailure(
      QUEUE_NAMES.IPFS_PINNING,
      failedJob({ attemptsMade: 2, finishedOn: undefined }),
      new Error('transient')
    );
    expect(moved).toBe(false);
    expect(dlq.jobs.size).toBe(0);
    expect(alerts).toHaveLength(0);
  });

  it('dead-letters exhausted jobs with full context and raises an alert', async () => {
    const { processor, dlq, alerts } = setup();
    const moved = await processor.handleFailure(QUEUE_NAMES.IPFS_PINNING, failedJob(), new Error('boom'));

    expect(moved).toBe(true);
    const entry = await processor.get('ipfs-pinning--job-1');
    expect(entry).toMatchObject({
      sourceQueue: QUEUE_NAMES.IPFS_PINNING,
      sourceJobId: 'job-1',
      jobName: 'pin',
      data: { cid: 'bafy', userId: 'u1' },
      attemptsMade: 6,
      failedReason: 'boom',
      userId: 'u1',
    });
    expect(dlq.jobs.size).toBe(1);
    expect(alerts).toEqual([expect.objectContaining({ kind: 'job-dead-lettered', queue: QUEUE_NAMES.IPFS_PINNING })]);
  });

  it('treats UnrecoverableError as terminal even with attempts remaining', () => {
    const job = failedJob({ attemptsMade: 1, finishedOn: undefined });
    expect(DlqProcessor.isTerminalFailure(job, new UnrecoverableError('bad input'))).toBe(true);
    expect(DlqProcessor.isTerminalFailure(job, new Error('flaky'))).toBe(false);
  });

  it('raises a throttled threshold alert when DLQ depth crosses the limit', async () => {
    const { processor, alerts, advance } = setup(2);
    await processor.handleFailure('ipfs-pinning', failedJob({ id: 'a' }));
    await processor.handleFailure('ipfs-pinning', failedJob({ id: 'b' }));
    await processor.handleFailure('ipfs-pinning', failedJob({ id: 'c' }));
    expect(alerts.filter((a) => a.kind === 'threshold-exceeded')).toHaveLength(1);

    advance(60_001);
    await processor.handleFailure('ipfs-pinning', failedJob({ id: 'd' }));
    expect(alerts.filter((a) => a.kind === 'threshold-exceeded')).toHaveLength(2);
  });

  it('replays a dead-lettered job onto its source queue and removes it from the DLQ', async () => {
    const { processor, source, dlq } = setup();
    await processor.handleFailure(QUEUE_NAMES.IPFS_PINNING, failedJob());

    const result = await processor.replay('ipfs-pinning--job-1');
    expect(result).toMatchObject({ sourceQueue: QUEUE_NAMES.IPFS_PINNING });
    expect(dlq.jobs.size).toBe(0);
    const [replayed] = [...source.jobs.values()];
    expect(replayed).toMatchObject({ name: 'pin', data: { cid: 'bafy', userId: 'u1' }, opts: { attempts: 6 } });
  });

  it('returns null when replaying or inspecting an unknown id', async () => {
    const { processor } = setup();
    await expect(processor.replay('missing')).resolves.toBeNull();
    await expect(processor.get('missing')).resolves.toBeNull();
    await expect(processor.purge('missing')).resolves.toBe(false);
  });

  it('refuses to replay into a queue it does not manage', async () => {
    const { processor } = setup();
    await processor.handleFailure('legacy-queue', failedJob());
    await expect(processor.replay('legacy-queue--job-1')).rejects.toThrow(/not managed/);
  });

  it('lists, filters and purges dead-lettered jobs', async () => {
    const { processor } = setup();
    await processor.handleFailure('ipfs-pinning', failedJob({ id: '1' }));
    await processor.handleFailure('ipfs-pinning', failedJob({ id: '2' }));
    await processor.handleFailure('email-notifications', failedJob({ id: '3' }));

    expect((await processor.list()).total).toBe(3);
    const filtered = await processor.list({ sourceQueue: 'email-notifications' });
    expect(filtered.entries.map((e) => e.sourceJobId)).toEqual(['3']);

    await expect(processor.purgeAll('ipfs-pinning')).resolves.toEqual({ purged: 2 });
    expect((await processor.list()).total).toBe(1);
  });
});

/**
 * End-to-end against a real Redis (provided in CI): a job that always fails
 * is attempted exactly 6 times (1 + 5 retries) and then lands in the DLQ.
 */
describe('QueueManager + BullMQ integration (real Redis)', () => {
  let redisAvailable = false;
  let manager: QueueManager;
  const alerts: DlqAlert[] = [];
  const prefix = `test-qm-${randomUUID()}`;

  beforeAll(async () => {
    const probe = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 500,
      retryStrategy: () => null,
    });
    probe.on('error', () => undefined);
    try {
      await probe.connect();
      redisAvailable = (await probe.ping()) === 'PONG';
    } catch {
      redisAvailable = false;
    } finally {
      probe.disconnect();
    }
    if (!redisAvailable) return;

    manager = new QueueManager({ prefix, backoffDelayMs: 5 });
    const dlqQueue = manager.getQueue('dead-letter') as any;
    // Swap in a DLQ processor whose alerts we can observe.
    (manager as any).dlqProcessor = new DlqProcessor({
      queue: dlqQueue,
      resolveSourceQueue: (name) => (manager.isManagedQueue(name) ? manager.getQueue(name) : undefined),
      alert: (a) => {
        alerts.push(a);
      },
    });
  });

  afterAll(async () => {
    if (!redisAvailable) return;
    for (const name of [...Object.values(QUEUE_NAMES), 'dead-letter'] as const) {
      await manager.getQueue(name as any).obliterate({ force: true }).catch(() => undefined);
    }
    await manager.close();
  });

  const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Timed out waiting for condition');
  };

  it('retries 5 times, then dead-letters the job; replay and purge work through the DLQ', async () => {
    if (!redisAvailable) {
      console.warn('Redis not reachable; skipping BullMQ integration test');
      return;
    }

    let attempts = 0;
    const worker = manager.createWorker(QUEUE_NAMES.IPFS_PINNING, async () => {
      attempts++;
      throw new Error('IPFS gateway unavailable');
    });

    await manager.enqueue(QUEUE_NAMES.IPFS_PINNING, 'pin', { cid: 'bafy-int' }, { userId: 'int-user' });
    await waitFor(async () => (await manager.dlq.depth()) === 1);

    expect(attempts).toBe(MAX_RETRIES + 1);
    const { entries } = await manager.dlq.list();
    expect(entries[0]).toMatchObject({
      sourceQueue: QUEUE_NAMES.IPFS_PINNING,
      attemptsMade: 6,
      failedReason: 'IPFS gateway unavailable',
      data: { cid: 'bafy-int', userId: 'int-user' },
    });
    expect(alerts.some((a) => a.kind === 'job-dead-lettered')).toBe(true);

    await worker.close();
    const replayed = await manager.dlq.replay(entries[0]!.id);
    expect(replayed).not.toBeNull();
    expect(await manager.dlq.depth()).toBe(0);
    const requeued = await manager.getQueue(QUEUE_NAMES.IPFS_PINNING).getJob(replayed!.replayedJobId);
    expect(requeued?.data).toMatchObject({ cid: 'bafy-int' });
  });

  it('dead-letters UnrecoverableError failures after a single attempt', async () => {
    if (!redisAvailable) return;

    let attempts = 0;
    const worker = manager.createWorker(QUEUE_NAMES.EMAIL_NOTIFICATIONS, async () => {
      attempts++;
      throw new UnrecoverableError('invalid recipient');
    });
    await manager.enqueue(QUEUE_NAMES.EMAIL_NOTIFICATIONS, 'send', { to: 'nobody' });
    await waitFor(async () => (await manager.dlq.list({ sourceQueue: QUEUE_NAMES.EMAIL_NOTIFICATIONS })).total === 1);
    expect(attempts).toBe(1);
    await worker.close();

    await expect(manager.dlq.purgeAll(QUEUE_NAMES.EMAIL_NOTIFICATIONS)).resolves.toEqual({ purged: 1 });
  });
});
