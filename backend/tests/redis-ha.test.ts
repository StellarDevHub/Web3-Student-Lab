import { describe, expect, it } from '@jest/globals';
import {
  REDIS_FAILOVER_BUDGET_MS,
  parseNodeList,
  reconnectOnReadonly,
  redisClusterConfig,
  redisSentinelConfig,
} from '../src/config/redis.config.js';
import { summarizeTopology, type RedisNodeProbe } from '../src/cache/RedisClient.js';
import { DistributedLockManager, type LockRedisClient } from '../src/lib/lock/index.js';
import {
  LockAcquisitionError,
  createDistributedLockManager,
  setDistributedLockManager,
  withDistributedLock,
} from '../src/utils/distributedLock.js';

/** One independent Redis primary. `down` simulates a crashed node. */
class FakeNode {
  readonly store = new Map<string, string>();
  down = false;
}

class FakeLockClient implements LockRedisClient {
  constructor(private readonly node: FakeNode) {}

  private assertUp(): void {
    if (this.node.down) throw new Error('ECONNREFUSED');
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<unknown> {
    this.assertUp();
    const nx = args.some((a) => String(a).toUpperCase() === 'NX');
    if (nx && this.node.store.has(key)) return null;
    this.node.store.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    this.assertUp();
    return this.node.store.get(key) ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    this.assertUp();
    return keys.filter((k) => this.node.store.delete(k)).length;
  }

  async pexpire(key: string): Promise<number> {
    this.assertUp();
    return this.node.store.has(key) ? 1 : 0;
  }

  async eval(_script: string, _numKeys: number, ...args: Array<string | number>): Promise<unknown> {
    this.assertUp();
    const key = String(args[0]);
    if (this.node.store.get(key) !== String(args[1])) return 0;
    if (_script.includes('del')) this.node.store.delete(key);
    return 1;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A backend pod: its own lock manager connected to every shared Redlock node. */
const createPod = (nodes: FakeNode[]): DistributedLockManager =>
  createDistributedLockManager(nodes.map((n) => new FakeLockClient(n)));

const fastRetry = { ttlMs: 5_000, retryCount: 50, retryDelayMs: 2, retryJitterMs: 2, autoExtend: false };

describe('Redis HA configuration (BE-004)', () => {
  it('parses host:port lists with a default port', () => {
    expect(parseNodeList('s1:26379, s2 ,s3:26381', 26379)).toEqual([
      { host: 's1', port: 26379 },
      { host: 's2', port: 26379 },
      { host: 's3', port: 26381 },
    ]);
    expect(parseNodeList(undefined, 6379)).toEqual([{ host: 'localhost', port: 6379 }]);
  });

  it('reconnects and resends when a demoted master answers READONLY', () => {
    expect(reconnectOnReadonly(new Error("READONLY You can't write against a read only replica."))).toBe(2);
    expect(reconnectOnReadonly(new Error('ECONNRESET'))).toBe(false);
  });

  it('configures sentinel mode to detect failover and reconnect inside the budget', () => {
    expect(REDIS_FAILOVER_BUDGET_MS).toBeLessThanOrEqual(3000);
    expect(redisSentinelConfig.failoverDetector).toBe(true);
    expect(redisSentinelConfig.role).toBe('master');
    expect(redisSentinelConfig.enableOfflineQueue).toBe(true);
    expect(redisSentinelConfig.connectTimeout).toBeLessThan(REDIS_FAILOVER_BUDGET_MS);
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect(redisSentinelConfig.retryStrategy(attempt)).toBeLessThan(REDIS_FAILOVER_BUDGET_MS);
      expect(redisSentinelConfig.sentinelRetryStrategy(attempt)).toBeLessThan(REDIS_FAILOVER_BUDGET_MS);
    }
  });

  it('keeps cluster failover retries inside the budget', () => {
    expect(redisClusterConfig.options.retryDelayOnFailover).toBeLessThan(REDIS_FAILOVER_BUDGET_MS);
    expect(redisClusterConfig.options.redisOptions.reconnectOnError).toBe(reconnectOnReadonly);
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect(redisClusterConfig.options.clusterRetryStrategy(attempt)).toBeLessThan(REDIS_FAILOVER_BUDGET_MS);
    }
  });
});

describe('Redis topology health probe (BE-004)', () => {
  const client = (node: string, healthy = true): RedisNodeProbe => ({ node, role: 'client', healthy, latencyMs: 1 });
  const sentinel = (node: string, master: string | undefined, healthy = true): RedisNodeProbe => ({
    node,
    role: 'sentinel',
    healthy,
    latencyMs: 1,
    ...(master ? { master } : {}),
  });

  it('is healthy when every pool client and sentinel agrees on one master', () => {
    const result = summarizeTopology([
      client('main'),
      client('pub'),
      client('sub'),
      sentinel('s1:26379', '10.0.0.2:6379'),
      sentinel('s2:26379', '10.0.0.2:6379'),
      sentinel('s3:26379', '10.0.0.2:6379'),
    ]);
    expect(result).toEqual({ status: 'healthy', master: '10.0.0.2:6379' });
  });

  it('is unhealthy when the main pool client cannot reach the master', () => {
    expect(summarizeTopology([client('main', false), sentinel('s1:26379', '10.0.0.2:6379')]).status).toBe(
      'unhealthy'
    );
  });

  it('is degraded when one sentinel is down but quorum remains', () => {
    const result = summarizeTopology([
      client('main'),
      sentinel('s1:26379', '10.0.0.2:6379'),
      sentinel('s2:26379', '10.0.0.2:6379'),
      sentinel('s3:26379', undefined, false),
    ]);
    expect(result).toEqual({ status: 'degraded', master: '10.0.0.2:6379' });
  });

  it('is degraded when sentinels disagree on the master (split brain)', () => {
    const result = summarizeTopology([
      client('main'),
      sentinel('s1:26379', '10.0.0.2:6379'),
      sentinel('s2:26379', '10.0.0.3:6379'),
      sentinel('s3:26379', '10.0.0.3:6379'),
    ]);
    expect(result).toEqual({ status: 'degraded', master: null });
  });

  it('is degraded when a pub/sub pool client is down', () => {
    expect(summarizeTopology([client('main'), client('sub', false)]).status).toBe('degraded');
  });
});

describe('Redlock across horizontally scaled pods (BE-004)', () => {
  it('serializes a read-modify-write critical section across pods', async () => {
    const nodes = [new FakeNode(), new FakeNode(), new FakeNode()];
    const pods = Array.from({ length: 5 }, () => createPod(nodes));
    let counter = 0;
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      pods.map((pod) =>
        pod.withLock('enroll:course-1', fastRetry, async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          const read = counter;
          await sleep(5);
          counter = read + 1;
          active -= 1;
        })
      )
    );

    expect(maxActive).toBe(1);
    expect(counter).toBe(pods.length);
    for (const node of nodes) expect(node.store.size).toBe(0);
  });

  it('keeps granting locks when a minority of nodes has crashed', async () => {
    const nodes = [new FakeNode(), new FakeNode(), new FakeNode()];
    nodes[0]!.down = true;
    const pod = createPod(nodes);

    expect(pod.quorum).toBe(2);
    const handle = await pod.acquire('job:reconcile');
    expect(handle).not.toBeNull();
    expect(await createPod(nodes).acquire('job:reconcile')).toBeNull();
    await handle!.release();
  });

  it('refuses the lock when a majority of nodes is unavailable', async () => {
    const nodes = [new FakeNode(), new FakeNode(), new FakeNode()];
    nodes[0]!.down = true;
    nodes[1]!.down = true;
    const pod = createPod(nodes);

    await expect(pod.withLock('job:reconcile', { ...fastRetry, retryCount: 1 }, async () => 'ran')).rejects.toBeInstanceOf(
      LockAcquisitionError
    );
    // No orphaned partial acquisition is left on the surviving node.
    expect(nodes[2]!.store.size).toBe(0);
  });

  it('routes withDistributedLock through the configured process-wide manager', async () => {
    const nodes = [new FakeNode(), new FakeNode(), new FakeNode()];
    setDistributedLockManager(createPod(nodes));
    try {
      const result = await withDistributedLock('cert:mint:student-1', async () => {
        expect(nodes.every((n) => n.store.size === 1)).toBe(true);
        return 'minted';
      });
      expect(result).toBe('minted');
      expect(nodes.every((n) => n.store.size === 0)).toBe(true);
    } finally {
      setDistributedLockManager(null);
    }
  });
});
