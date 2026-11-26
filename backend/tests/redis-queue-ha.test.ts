import { describe, expect, it, jest } from '@jest/globals';
import { Cluster, type RedisOptions } from 'ioredis';
import {
  CLUSTER_QUEUE_PREFIX,
  QUEUE_FAILOVER_BUDGET_MS,
  QueueFailoverMonitor,
  buildClusterQueueConnection,
  buildSentinelQueueConnection,
  buildStandaloneQueueConnection,
  describeQueueTopology,
  resolveQueueTopology,
} from '../src/config/redis.js';
import { reconnectOnReadonly } from '../src/config/redis.config.js';
import { QueueManager } from '../src/queues/queueManager.js';

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const CA = '-----BEGIN CERTIFICATE-----\nMIIBfakeCA\n-----END CERTIFICATE-----';

const retryDelays = (strategy: ((times: number) => number) | undefined): number[] =>
  Array.from({ length: 50 }, (_, i) => strategy!(i + 1));

describe('BullMQ Redis topology (BE-062)', () => {
  it('builds a standalone connection from REDIS_URL with BullMQ-safe retries', () => {
    const connection = buildStandaloneQueueConnection({
      REDIS_URL: 'redis://student:s3cret@redis.internal:6380/2',
    }) as RedisOptions;

    expect(connection).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      username: 'student',
      password: 's3cret',
      db: 2,
      // BullMQ requires null so commands survive the promotion window.
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      enableReadyCheck: true,
    });
    expect(connection.reconnectOnError).toBe(reconnectOnReadonly);
    for (const delay of retryDelays(connection.retryStrategy)) {
      expect(delay).toBeLessThan(QUEUE_FAILOVER_BUDGET_MS);
    }
  });

  it('falls back to REDIS_HOST/REDIS_PORT in local single-node development', () => {
    const connection = buildStandaloneQueueConnection({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6380',
    }) as RedisOptions;
    expect(connection).toMatchObject({ host: '127.0.0.1', port: 6380 });
  });

  it('encrypts standalone traffic when REDIS_TLS or a rediss:// URL is configured', () => {
    const fromUrl = buildStandaloneQueueConnection({ REDIS_URL: 'rediss://redis.internal:6379' }) as RedisOptions;
    expect(fromUrl.tls).toBeDefined();

    const fromFlag = buildStandaloneQueueConnection({
      REDIS_URL: 'redis://redis.internal:6379',
      REDIS_TLS: 'true',
      REDIS_TLS_CA: CA,
      REDIS_TLS_SERVERNAME: 'redis.internal',
      REDIS_TLS_REJECT_UNAUTHORIZED: 'false',
    }) as RedisOptions;
    expect(fromFlag.tls).toMatchObject({
      ca: CA,
      servername: 'redis.internal',
      rejectUnauthorized: false,
    });

    const plain = buildStandaloneQueueConnection({ REDIS_URL: 'redis://localhost:6379' }) as RedisOptions;
    expect(plain.tls).toBeUndefined();
  });

  it('configures Sentinel master discovery, failover detection and reconnect events', () => {
    const connection = buildSentinelQueueConnection({
      REDIS_SENTINELS: 'sentinel-1:26379, sentinel-2:26380,sentinel-3',
      REDIS_SENTINEL_NAME: 'mymaster',
      REDIS_PASSWORD: 'app-password',
      REDIS_SENTINEL_PASSWORD: 'sentinel-password',
    }) as any;

    expect(connection.sentinels).toEqual([
      { host: 'sentinel-1', port: 26379 },
      { host: 'sentinel-2', port: 26380 },
      { host: 'sentinel-3', port: 26379 },
    ]);
    expect(connection.name).toBe('mymaster');
    expect(connection.role).toBe('master');
    expect(connection.password).toBe('app-password');
    expect(connection.sentinelPassword).toBe('sentinel-password');
    // +switch-master subscription is what moves workers to the promoted replica.
    expect(connection.failoverDetector).toBe(true);
    expect(connection.updateSentinels).toBe(true);
    expect(connection.maxRetriesPerRequest).toBeNull();
    expect(connection.enableOfflineQueue).toBe(true);
    expect(connection.connectTimeout).toBeLessThan(QUEUE_FAILOVER_BUDGET_MS);
    for (const delay of [...retryDelays(connection.retryStrategy), ...retryDelays(connection.sentinelRetryStrategy)]) {
      expect(delay).toBeLessThan(QUEUE_FAILOVER_BUDGET_MS);
    }
  });

  it('applies TLS to sentinel control traffic and allows it to be disabled independently', () => {
    const secured = buildSentinelQueueConnection({
      REDIS_SENTINELS: 'sentinel-1:26379',
      REDIS_TLS: 'true',
      REDIS_TLS_CA: CA,
      REDIS_SENTINEL_TLS: 'true',
      REDIS_SENTINEL_TLS_CA: CA,
    }) as any;
    expect(secured.tls).toMatchObject({ ca: CA });
    expect(secured.sentinelTLS).toMatchObject({ ca: CA });
    expect(secured.enableTLSForSentinelMode).toBe(true);

    const plainSentinel = buildSentinelQueueConnection({
      REDIS_SENTINELS: 'sentinel-1:26379',
      REDIS_TLS: 'true',
      REDIS_SENTINEL_TLS: 'false',
    }) as any;
    expect(plainSentinel.tls).toBeDefined();
    expect(plainSentinel.sentinelTLS).toBeUndefined();
    expect(plainSentinel.enableTLSForSentinelMode).toBeUndefined();
  });

  it('requires a sentinel node list instead of silently using one local node', () => {
    expect(() => buildSentinelQueueConnection({ REDIS_MODE: 'sentinel' })).toThrow(/REDIS_SENTINELS/);
  });

  it('creates a cluster client that follows slot changes and refreshes inside the budget', () => {
    const connection = buildClusterQueueConnection({
      REDIS_CLUSTER_NODES: 'cluster-1:6381,cluster-2:6382',
    }) as unknown as Cluster;

    try {
      expect(connection).toBeInstanceOf(Cluster);
      const options = (connection as any).options;
      expect(options.redisOptions.maxRetriesPerRequest).toBeNull();
      expect(options.redisOptions.reconnectOnError).toBe(reconnectOnReadonly);
      expect(options.enableReadyCheck).toBe(true);
      expect(options.retryDelayOnFailover).toBeLessThan(QUEUE_FAILOVER_BUDGET_MS);
      expect(options.retryDelayOnClusterDown).toBeLessThan(QUEUE_FAILOVER_BUDGET_MS);
      expect(options.slotsRefreshTimeout).toBeLessThan(QUEUE_FAILOVER_BUDGET_MS);
      for (const delay of retryDelays(options.clusterRetryStrategy)) {
        expect(delay).toBeLessThan(QUEUE_FAILOVER_BUDGET_MS);
      }
    } finally {
      connection.disconnect();
    }
  });

  it('uses a hash-tag queue prefix in cluster mode and rejects prefixes without one', () => {
    const cluster = resolveQueueTopology({
      REDIS_MODE: 'cluster',
      REDIS_CLUSTER_NODES: 'cluster-1:6381',
    });
    expect(cluster.mode).toBe('cluster');
    expect(cluster.prefix).toBe(CLUSTER_QUEUE_PREFIX);
    expect(cluster.prefix).toContain('{');

    expect(() =>
      resolveQueueTopology({
        REDIS_MODE: 'cluster',
        REDIS_CLUSTER_NODES: 'cluster-1:6381',
        REDIS_QUEUE_PREFIX: 'bull',
      })
    ).toThrow(/hash tag/);
    expect(() => resolveQueueTopology({ REDIS_MODE: 'cluster' })).toThrow(/REDIS_CLUSTER_NODES/);
  });

  it('resolves standalone/sentinel modes without a prefix override', () => {
    expect(resolveQueueTopology({}).prefix).toBeUndefined();
    expect(
      resolveQueueTopology({ REDIS_MODE: 'sentinel', REDIS_SENTINELS: 's1:26379' }).prefix
    ).toBeUndefined();
    expect(() => resolveQueueTopology({ REDIS_MODE: 'replica' })).toThrow(/Unsupported REDIS_MODE/);
  });

  it('describes the topology for startup logs without leaking credentials or TLS material', () => {
    const description = describeQueueTopology({
      REDIS_MODE: 'sentinel',
      REDIS_SENTINELS: 'sentinel-1:26379',
      REDIS_SENTINEL_NAME: 'mymaster',
      REDIS_PASSWORD: 's3cret',
      REDIS_TLS: 'true',
      REDIS_TLS_CA: CA,
    });

    expect(description).toMatchObject({
      mode: 'sentinel',
      tls: true,
      sentinels: ['sentinel-1:26379'],
      sentinelName: 'mymaster',
      failoverBudgetMs: QUEUE_FAILOVER_BUDGET_MS,
    });
    expect(JSON.stringify(description)).not.toContain('s3cret');
    expect(JSON.stringify(description)).not.toContain('BEGIN CERTIFICATE');
  });
});

describe('Queue failover monitor (BE-062)', () => {
  it('does not count a normal startup as a failover', () => {
    const monitor = new QueueFailoverMonitor(5_000, () => 1_000);
    expect(monitor.markReady()).toBeNull();
    expect(monitor.getStats()).toMatchObject({ lastFailoverAt: null, lastRecoveryMs: null, recoveries: 0 });
  });

  it('records recovery inside the 5s budget', () => {
    let now = 10_000;
    const monitor = new QueueFailoverMonitor(5_000, () => now);
    monitor.markDisconnected();
    monitor.markDisconnected(now + 2_000); // further errors are idempotent
    now += 3_400;

    expect(monitor.markReady()).toEqual({ recoveryMs: 3_400, withinBudget: true });
    expect(monitor.getStats()).toEqual({
      lastFailoverAt: new Date(10_000).toISOString(),
      lastRecoveryMs: 3_400,
      budgetMs: 5_000,
      withinBudget: true,
      recoveries: 1,
      breaches: 0,
    });
  });

  it('flags recoveries that exceed the budget', () => {
    let now = 0;
    const monitor = new QueueFailoverMonitor(5_000, () => now);
    monitor.markDisconnected();
    now = 7_500;

    expect(monitor.markReady()).toEqual({ recoveryMs: 7_500, withinBudget: false });
    expect(monitor.getStats()).toMatchObject({ withinBudget: false, breaches: 1, recoveries: 1 });
  });
});

describe('QueueManager topology wiring (BE-062)', () => {
  const build = (env: NodeJS.ProcessEnv) => {
    const manager = new QueueManager({
      topology: resolveQueueTopology(env),
      rateLimitStore: { incr: async () => 1, pexpire: async () => 1 },
      queueFactory: () => {
        throw new Error('not used');
      },
    });
    return manager;
  };

  it('reports the sentinel topology it was built from', () => {
    const manager = build({
      REDIS_MODE: 'sentinel',
      REDIS_SENTINELS: 'sentinel-1:26379,sentinel-2:26379',
      REDIS_TLS: 'true',
    });
    expect(manager.getRedisTopology()).toMatchObject({
      mode: 'sentinel',
      tls: true,
      sentinels: ['sentinel-1:26379', 'sentinel-2:26379'],
    });
    expect(manager.getQueueFailoverStats()).toMatchObject({ budgetMs: QUEUE_FAILOVER_BUDGET_MS, recoveries: 0 });
  });

  it('adopts the cluster hash-tag prefix for every queue it creates', () => {
    const manager = build({ REDIS_MODE: 'cluster', REDIS_CLUSTER_NODES: 'cluster-1:6381' });
    expect((manager as any).prefix).toBe(CLUSTER_QUEUE_PREFIX);
  });
});
