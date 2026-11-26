/**
 * Redis topology resolution for BullMQ queues — BE-062.
 *
 * The cache layer (see `RedisClient`) has been able to speak Sentinel and
 * Cluster for a while, but the queue layer still resolved a single
 * `REDIS_URL`. A master restart therefore took down minting, evaluation and
 * email jobs even though a replica had already been promoted.
 *
 * This module is the single place where a BullMQ connection is derived from
 * the deployment topology:
 *
 *   REDIS_MODE=standalone → REDIS_URL (or REDIS_HOST/REDIS_PORT)
 *   REDIS_MODE=sentinel   → REDIS_SENTINELS + REDIS_SENTINEL_NAME
 *   REDIS_MODE=cluster    → REDIS_CLUSTER_NODES
 *
 * Guarantees required by the issue's acceptance criteria:
 *  - Sentinel clients subscribe to `+switch-master` (`failoverDetector`) so a
 *    worker reattaches to the promoted replica immediately instead of waiting
 *    for the dead socket to time out.
 *  - Retry/connect budgets stay well inside {@link QUEUE_FAILOVER_BUDGET_MS}
 *    (5s by default) and `maxRetriesPerRequest: null` means BullMQ keeps
 *    retrying through the promotion window rather than failing jobs.
 *  - `reconnectOnReadonly` forces a reconnect when a demoted master answers
 *    READONLY, so commands are resent to the new master.
 *  - BullMQ keys use a hash tag prefix (`{bull}`) in cluster mode, keeping all
 *    keys of a queue in one slot where Lua scripts can run atomically.
 *  - TLS applies to data, sentinel and cluster traffic (see
 *    `buildRedisTlsOptions` in `redis.config.ts`).
 *
 * Every connection is created per BullMQ client: Worker instances own a
 * blocking connection and must never share a socket with the producer side.
 */

import { Cluster } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import {
  buildRedisTlsOptions,
  parseNodeList,
  reconnectOnReadonly,
} from './redis.config.js';

export type RedisTopologyMode = 'standalone' | 'sentinel' | 'cluster';

/**
 * A promoted master must be picked up by every worker inside this window
 * (BE-062 acceptance criterion). Kept separate from the cache-layer budget
 * (`REDIS_FAILOVER_BUDGET_MS`, 3s) because a BullMQ worker additionally has to
 * re-arm its blocking `BZPOPMIN` loop.
 */
const configuredFailoverBudgetMs = parseInt(process.env.REDIS_QUEUE_FAILOVER_BUDGET_MS || '', 10);
export const QUEUE_FAILOVER_BUDGET_MS =
  Number.isFinite(configuredFailoverBudgetMs) && configuredFailoverBudgetMs > 0
    ? configuredFailoverBudgetMs
    : 5000;

/**
 * BullMQ requires the keys of one queue to live in a single cluster hash slot.
 * Braces are the cluster hash tag syntax; without them Lua scripts used by
 * BullMQ fail with CROSSSLOT on a real cluster.
 */
export const CLUSTER_QUEUE_PREFIX = '{bull}';

export interface QueueTopologyDescription {
  mode: RedisTopologyMode;
  /** BullMQ key prefix; a `{...}` hash tag in cluster mode. */
  prefix?: string;
  tls: boolean;
  failoverBudgetMs: number;
  host?: string;
  port?: number;
  db?: number;
  sentinels?: string[];
  sentinelName?: string;
  clusterNodes?: string[];
}

export interface QueueTopology {
  mode: RedisTopologyMode;
  /** Passed to every `Queue`/`Worker`; undefined lets BullMQ use its default. */
  prefix: string | undefined;
  /** Describes the topology without exposing passwords or TLS material. */
  describe(): QueueTopologyDescription;
  /** Creates a fresh connection; never share one between BullMQ clients. */
  createConnection(): ConnectionOptions;
}

const sleepCap = (): number => Math.max(100, Math.floor(QUEUE_FAILOVER_BUDGET_MS / 2));

/**
 * Cap retry delays at half the failover budget so a reconnect attempt is made
 * several times inside the window instead of sleeping past it.
 */
function queueRetryStrategy(times: number): number {
  return Math.min(times * 100, sleepCap());
}

function readMode(env: NodeJS.ProcessEnv): RedisTopologyMode {
  const raw = (env.REDIS_MODE || 'standalone').trim().toLowerCase();
  if (raw === 'standalone' || raw === 'sentinel' || raw === 'cluster') return raw;
  throw new Error(
    `Unsupported REDIS_MODE '${env.REDIS_MODE}'. Expected one of: standalone, sentinel, cluster.`
  );
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function queuePrefix(env: NodeJS.ProcessEnv): string | undefined {
  return env.REDIS_QUEUE_PREFIX?.trim() || undefined;
}

/**
 * Standalone connection built from `REDIS_URL`, falling back to
 * `REDIS_HOST`/`REDIS_PORT` for parity with the rest of the codebase.
 */
export function buildStandaloneQueueConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const url = new URL(
    env.REDIS_URL || `redis://${env.REDIS_HOST || 'localhost'}:${env.REDIS_PORT || '6379'}`
  );
  const tls = buildRedisTlsOptions(env);
  const db = url.pathname.length > 1 ? Number.parseInt(url.pathname.slice(1), 10) : undefined;
  const port = Number.parseInt(url.port, 10) || 6379;
  const username = url.username ? decodeURIComponent(url.username) : env.REDIS_USERNAME;
  const password = url.password ? decodeURIComponent(url.password) : env.REDIS_PASSWORD;

  return {
    host: url.hostname || env.REDIS_HOST || 'localhost',
    port,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(db !== undefined && Number.isFinite(db) ? { db } : {}),
    ...(tls ? { tls } : {}),
    // BullMQ requires null so in-flight commands survive a failover.
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    enableReadyCheck: true,
    connectTimeout: 2000,
    retryStrategy: queueRetryStrategy,
    reconnectOnError: reconnectOnReadonly,
  };
}

/**
 * Sentinel connection. `failoverDetector` subscribes to `+switch-master` on
 * the sentinels, which is what gets a worker onto the new master in well under
 * the 5s budget. `updateSentinels` keeps the sentinel list fresh after the
 * topology changes.
 */
export function buildSentinelQueueConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const rawSentinels = requireNonEmpty(
    env.REDIS_SENTINELS,
    'REDIS_MODE=sentinel requires REDIS_SENTINELS=host:port,host:port,...'
  );
  const tls = buildRedisTlsOptions(env);
  const sentinelTls = buildRedisTlsOptions(env, 'REDIS_SENTINEL', Boolean(tls));

  return {
    sentinels: parseNodeList(rawSentinels, 26379),
    name: env.REDIS_SENTINEL_NAME?.trim() || 'mymaster',
    role: 'master',
    ...(env.REDIS_USERNAME ? { username: env.REDIS_USERNAME } : {}),
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    ...(env.REDIS_SENTINEL_USERNAME ? { sentinelUsername: env.REDIS_SENTINEL_USERNAME } : {}),
    ...(env.REDIS_SENTINEL_PASSWORD ? { sentinelPassword: env.REDIS_SENTINEL_PASSWORD } : {}),
    ...(tls ? { tls } : {}),
    ...(sentinelTls ? { sentinelTLS: sentinelTls, enableTLSForSentinelMode: true } : {}),
    failoverDetector: true,
    updateSentinels: true,
    // Keep both the sentinel resolution and the master handshake inside the budget.
    connectTimeout: 2000,
    sentinelCommandTimeout: 500,
    sentinelRetryStrategy: queueRetryStrategy,
    retryStrategy: queueRetryStrategy,
    // Buffer job writes issued while Sentinel promotes the replica.
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    reconnectOnError: reconnectOnReadonly,
  };
}

/**
 * Cluster connection. A `Cluster` instance (rather than plain options) is
 * required because BullMQ/ioredis must follow MOVED/ASK redirects and refresh
 * the slot map after a shard failover.
 */
export function buildClusterQueueConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const rawNodes = requireNonEmpty(
    env.REDIS_CLUSTER_NODES,
    'REDIS_MODE=cluster requires REDIS_CLUSTER_NODES=host:port,host:port,...'
  );
  const nodes = parseNodeList(rawNodes, 6379);
  const tls = buildRedisTlsOptions(env, 'REDIS_CLUSTER', Boolean(buildRedisTlsOptions(env)));
  const username = env.REDIS_CLUSTER_USERNAME || env.REDIS_USERNAME;
  const password = env.REDIS_CLUSTER_PASSWORD || env.REDIS_PASSWORD;

  // BullMQ's own ioredis copy differs in patch version from the app's, so the
  // instance is structurally compatible but not nominally. BullMQ detects
  // clients by duck typing (`isCluster`), so the cast is safe.
  return new Cluster(nodes, {
    redisOptions: {
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(tls ? { tls } : {}),
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
      reconnectOnError: reconnectOnReadonly,
    },
    enableReadyCheck: true,
    // Stay inside the budget while the slot map is refreshed after failover.
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 100,
    retryDelayOnTryAgain: 100,
    slotsRefreshTimeout: 2000,
    clusterRetryStrategy: queueRetryStrategy,
    // Do not open sockets while the topology is only being resolved.
    lazyConnect: true,
  }) as unknown as ConnectionOptions;
}

/** Describes the configured queue topology without exposing credentials. */
export function describeQueueTopology(env: NodeJS.ProcessEnv = process.env): QueueTopologyDescription {
  const mode = readMode(env);
  const base = {
    mode,
    ...(queuePrefix(env) || mode === 'cluster' ? { prefix: queuePrefix(env) ?? CLUSTER_QUEUE_PREFIX } : {}),
    tls: Boolean(buildRedisTlsOptions(env)),
    failoverBudgetMs: QUEUE_FAILOVER_BUDGET_MS,
  };

  if (mode === 'sentinel') {
    return {
      ...base,
      sentinels: parseNodeList(env.REDIS_SENTINELS, 26379).map((s) => `${s.host}:${s.port}`),
      sentinelName: env.REDIS_SENTINEL_NAME?.trim() || 'mymaster',
    };
  }

  if (mode === 'cluster') {
    return {
      ...base,
      clusterNodes: parseNodeList(env.REDIS_CLUSTER_NODES, 6379).map((n) => `${n.host}:${n.port}`),
    };
  }

  const url = new URL(
    env.REDIS_URL || `redis://${env.REDIS_HOST || 'localhost'}:${env.REDIS_PORT || '6379'}`
  );
  return {
    ...base,
    host: url.hostname || env.REDIS_HOST || 'localhost',
    port: Number.parseInt(url.port, 10) || 6379,
    ...(url.pathname.length > 1 ? { db: Number.parseInt(url.pathname.slice(1), 10) || 0 } : {}),
  };
}

/**
 * Resolves the queue topology from the environment. Throws for unsupported
 * modes and for missing sentinel/cluster node lists, so a misconfigured
 * deployment fails at startup instead of silently writing to a single node.
 */
export function resolveQueueTopology(env: NodeJS.ProcessEnv = process.env): QueueTopology {
  const mode = readMode(env);
  const explicitPrefix = queuePrefix(env);

  if (mode === 'cluster') {
    // Validate eagerly: a cluster deployment without nodes or a hash tag would
    // only fail later, on the first CROSSSLOT error.
    requireNonEmpty(env.REDIS_CLUSTER_NODES, 'REDIS_MODE=cluster requires REDIS_CLUSTER_NODES=host:port,...');
    const prefix = explicitPrefix ?? CLUSTER_QUEUE_PREFIX;
    if (!prefix.includes('{')) {
      throw new Error(
        `REDIS_QUEUE_PREFIX '${prefix}' must contain a Redis Cluster hash tag (e.g. '{bull}') so ` +
          'all keys of a queue map to the same slot.'
      );
    }
    return {
      mode,
      prefix,
      describe: () => describeQueueTopology(env),
      createConnection: () => buildClusterQueueConnection(env),
    };
  }

  if (mode === 'sentinel') {
    requireNonEmpty(env.REDIS_SENTINELS, 'REDIS_MODE=sentinel requires REDIS_SENTINELS=host:port,host:port,...');
    return {
      mode,
      prefix: explicitPrefix,
      describe: () => describeQueueTopology(env),
      createConnection: () => buildSentinelQueueConnection(env),
    };
  }

  return {
    mode,
    prefix: explicitPrefix,
    describe: () => describeQueueTopology(env),
    createConnection: () => buildStandaloneQueueConnection(env),
  };
}

export interface QueueFailoverStats {
  lastFailoverAt: string | null;
  lastRecoveryMs: number | null;
  budgetMs: number;
  withinBudget: boolean;
  recoveries: number;
  breaches: number;
}

/**
 * Measures how long a BullMQ worker observed the Redis connection as down.
 * A Worker emits `error` when its connection dies and `ready` once the new
 * master answers; the gap is the client-observed failover time.
 */
export class QueueFailoverMonitor {
  private disconnectedAt: number | null = null;
  private lastFailoverAt: number | null = null;
  private lastRecoveryMs: number | null = null;
  private recoveries = 0;
  private breaches = 0;

  constructor(
    private readonly budgetMs: number = QUEUE_FAILOVER_BUDGET_MS,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Records the first disconnect of an outage; later errors are idempotent. */
  markDisconnected(at: number = this.now()): void {
    if (this.disconnectedAt === null) this.disconnectedAt = at;
  }

  /**
   * Records a recovery. Returns null when no disconnect was observed, so a
   * normal startup does not count as a failover.
   */
  markReady(at: number = this.now()): { recoveryMs: number; withinBudget: boolean } | null {
    if (this.disconnectedAt === null) return null;

    const recoveryMs = Math.max(0, at - this.disconnectedAt);
    this.lastFailoverAt = this.disconnectedAt;
    this.lastRecoveryMs = recoveryMs;
    this.disconnectedAt = null;
    this.recoveries += 1;

    const withinBudget = recoveryMs <= this.budgetMs;
    if (!withinBudget) this.breaches += 1;
    return { recoveryMs, withinBudget };
  }

  /** True while the client has not recovered from the last observed outage. */
  isDisconnected(): boolean {
    return this.disconnectedAt !== null;
  }

  getStats(): QueueFailoverStats {
    return {
      lastFailoverAt: this.lastFailoverAt === null ? null : new Date(this.lastFailoverAt).toISOString(),
      lastRecoveryMs: this.lastRecoveryMs,
      budgetMs: this.budgetMs,
      withinBudget: this.lastRecoveryMs === null || this.lastRecoveryMs <= this.budgetMs,
      recoveries: this.recoveries,
      breaches: this.breaches,
    };
  }
}
