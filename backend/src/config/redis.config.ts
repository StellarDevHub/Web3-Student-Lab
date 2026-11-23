import { readFileSync } from 'node:fs';
import { lookup as dnsLookup } from 'node:dns';
import logger from '../utils/logger.js';

const TRUTHY_FLAGS = new Set(['1', 'true', 'yes', 'on']);

/** Parse the boolean-ish environment flags used across the Redis config. */
export function envFlag(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_FLAGS.has(value.trim().toLowerCase());
}

export interface RedisTlsOptions {
  ca?: string;
  cert?: string;
  key?: string;
  servername?: string;
  rejectUnauthorized?: boolean;
}

/** Accept either an inline PEM blob or a path to a PEM file. */
function readPem(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.includes('-----BEGIN')) return trimmed;
  try {
    return readFileSync(trimmed, 'utf8');
  } catch (error) {
    throw new Error(
      `Redis TLS: cannot read ${label} from '${trimmed}' (${error instanceof Error ? error.message : String(error)}). ` +
        'Provide an inline PEM value or an absolute path to a readable certificate file.'
    );
  }
}

/**
 * TLS options for Redis traffic (BE-062). Enabled by `<PREFIX>_TLS=true` — or,
 * for the main data path, by a `rediss://` REDIS_URL. CA/cert/key may be inline
 * PEM or file paths, so Kubernetes secrets can be mounted directly.
 *
 *   REDIS_TLS=true
 *   REDIS_TLS_CA=/etc/redis/tls/ca.crt
 *   REDIS_TLS_CERT=/etc/redis/tls/tls.crt
 *   REDIS_TLS_KEY=/etc/redis/tls/tls.key
 *   REDIS_TLS_SERVERNAME=redis.internal
 *   REDIS_TLS_REJECT_UNAUTHORIZED=false   # only for self-signed dev certs
 */
export function buildRedisTlsOptions(
  env: NodeJS.ProcessEnv = process.env,
  prefix = 'REDIS',
  fallbackEnabled = false
): RedisTlsOptions | undefined {
  const flag = env[`${prefix}_TLS`];
  const urlUsesTls = prefix === 'REDIS' && (env.REDIS_URL ?? '').trim().toLowerCase().startsWith('rediss://');
  const enabled = flag !== undefined ? envFlag(flag) : fallbackEnabled || urlUsesTls;
  if (!enabled) return undefined;

  const options: RedisTlsOptions = {};
  const ca = readPem(env[`${prefix}_TLS_CA`], `${prefix}_TLS_CA`);
  const cert = readPem(env[`${prefix}_TLS_CERT`], `${prefix}_TLS_CERT`);
  const key = readPem(env[`${prefix}_TLS_KEY`], `${prefix}_TLS_KEY`);
  if (ca) options.ca = ca;
  if (cert) options.cert = cert;
  if (key) options.key = key;
  const servername = env[`${prefix}_TLS_SERVERNAME`];
  if (servername) options.servername = servername;
  const rejectUnauthorized = env[`${prefix}_TLS_REJECT_UNAUTHORIZED`];
  if (rejectUnauthorized !== undefined) options.rejectUnauthorized = envFlag(rejectUnauthorized);

  return options;
}

// TLS for the data path, sentinel control connections and cluster nodes. Each
// can be overridden independently; sentinel/cluster inherit the data-path
// setting when their own flag is absent.
const standaloneTls = buildRedisTlsOptions();
const sentinelTls = buildRedisTlsOptions(process.env, 'REDIS_SENTINEL', Boolean(standaloneTls));
const clusterTls = buildRedisTlsOptions(process.env, 'REDIS_CLUSTER', Boolean(standaloneTls));

// Standalone Redis configuration
export const redisConfig: any = process.env.REDIS_URL
  ? {
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      ...(standaloneTls ? { tls: standaloneTls } : {}),
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      enableOfflineQueue: false,
      enableReadyCheck: true,
      enableAutoPipelining: true,
      autoPipeliningIgnoredCommands: ['info', 'ping'],
    }
  : (() => {
      logger.warn('⚠️  REDIS_URL is not set, falling back to REDIS_HOST/REDIS_PORT (default localhost:6379).');
      return {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
        ...(standaloneTls ? { tls: standaloneTls } : {}),
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        enableOfflineQueue: false,
        enableReadyCheck: true,
        enableAutoPipelining: true,
        autoPipeliningIgnoredCommands: ['info', 'ping'],
      };
    })();

/**
 * Failover budget (BE-004). A Sentinel promotion or Cluster slot migration
 * must be absorbed by the client within this window; recoveries slower than
 * this are logged as SLO breaches and surfaced by the Redis health probe.
 */
export const REDIS_FAILOVER_BUDGET_MS = parseInt(process.env.REDIS_FAILOVER_BUDGET_MS || '3000', 10);

/**
 * After a failover the demoted master keeps accepting connections but rejects
 * writes with READONLY. Returning 2 tells ioredis to reconnect (re-resolving
 * the new master through Sentinel / the slot map) and resend the command.
 */
export function reconnectOnReadonly(err: Error): boolean | 1 | 2 {
  return err.message.startsWith('READONLY') ? 2 : false;
}

// Redis Cluster configuration for high availability
export const redisClusterConfig = {
  nodes: parseNodeList(process.env.REDIS_CLUSTER_NODES, 6379),
  password: process.env.REDIS_CLUSTER_PASSWORD || process.env.REDIS_PASSWORD,
  options: {
    redisOptions: {
      username: process.env.REDIS_CLUSTER_USERNAME || process.env.REDIS_USERNAME,
      password: process.env.REDIS_CLUSTER_PASSWORD || process.env.REDIS_PASSWORD,
      ...(clusterTls ? { tls: clusterTls } : {}),
      maxRetriesPerRequest: 3,
      connectTimeout: 2000,
      reconnectOnError: reconnectOnReadonly,
    },
    enableReadyCheck: true,
    enableAutoPipelining: true,
    autoPipeliningIgnoredCommands: ['info', 'ping'],
    // Keep retry delays well inside the failover budget so a replica promoted
    // by the cluster bus is picked up on the next slot refresh.
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 100,
    retryDelayOnTryAgain: 100,
    slotsRefreshTimeout: 2000,
    clusterRetryStrategy: (times: number) => Math.min(times * 100, 1000),
    dnsLookup: (address: string, callback: (err: NodeJS.ErrnoException | null, address: string, family?: number) => void) => {
      dnsLookup(address, callback);
    },
  },
};

// Sentinel configuration for automatic failover. Options are flat because
// ioredis reads them from the top-level constructor argument.
export const redisSentinelConfig = {
  sentinels: parseNodeList(process.env.REDIS_SENTINELS, 26379),
  name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
  role: 'master' as const,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  sentinelUsername: process.env.REDIS_SENTINEL_USERNAME,
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
  ...(standaloneTls ? { tls: standaloneTls } : {}),
  ...(sentinelTls ? { sentinelTLS: sentinelTls, enableTLSForSentinelMode: true } : {}),
  // Subscribe to +switch-master on the sentinels so the client reconnects the
  // moment a replica is promoted instead of waiting for the dead socket to time out.
  failoverDetector: true,
  updateSentinels: true,
  connectTimeout: 2000,
  sentinelCommandTimeout: 500,
  sentinelRetryStrategy: (times: number) => Math.min(times * 100, 1000),
  retryStrategy: (times: number) => Math.min(times * 50, 500),
  reconnectOnError: reconnectOnReadonly,
  // Buffer commands issued during the promotion window rather than failing them.
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableAutoPipelining: true,
  autoPipeliningIgnoredCommands: ['info', 'ping'],
};

/**
 * Independent Redis primaries used by the Redlock quorum (BE-004). They must
 * NOT be replicas of each other — Redlock's safety relies on independent
 * failure domains. Empty means "use the main connection as a single lock node".
 */
export const redlockConfig = {
  nodes: process.env.REDLOCK_NODES ? parseNodeList(process.env.REDLOCK_NODES, 6379) : [],
  password: process.env.REDLOCK_PASSWORD || process.env.REDIS_PASSWORD,
  clockDriftFactor: parseFloat(process.env.REDLOCK_CLOCK_DRIFT_FACTOR || '0.01'),
  // A dead lock node must fail fast so it does not eat the lock validity window.
  nodeOptions: {
    connectTimeout: 500,
    commandTimeout: 250,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  },
};

// Cache TTL configurations for different data types
export const cacheTTL = {
  // Blockchain data - shorter TTL due to frequent updates
  blockchain: {
    blockHeader: 10, // 10 seconds
    accountBalance: 30, // 30 seconds
    contractState: 60, // 1 minute
    transactionStatus: 120, // 2 minutes
    tokenMetadata: 3600, // 1 hour
  },
  user: {
    profile: 300, // 5 minutes
    progress: 180, // 3 minutes
    certificates: 600, // 10 minutes
    onChainData: 60, // 1 minute
  },
  courses: {
    list: 1800, // 30 minutes
    detail: 900, // 15 minutes
    curriculum: 1800, // 30 minutes
  },
  leaderboard: {
    global: 300, // 5 minutes
    weekly: 180, // 3 minutes
  },
  rpc: {
    methodResponse: 60, // 1 minute - for generic RPC call results
  },
};

// Parse a comma separated `host:port` list from the environment
export function parseNodeList(raw: string | undefined, defaultPort: number): Array<{ host: string; port: number }> {
  if (!raw) {
    return [{ host: 'localhost', port: defaultPort }];
  }
  return raw
    .split(',')
    .map((node) => node.trim())
    .filter(Boolean)
    .map((node) => {
      const [host, port] = node.split(':');
      return { host: host || 'localhost', port: parseInt(port || String(defaultPort), 10) };
    });
}

// Redis mode configuration
export const REDIS_MODE = (process.env.REDIS_MODE || 'standalone') as 'standalone' | 'cluster' | 'sentinel';
