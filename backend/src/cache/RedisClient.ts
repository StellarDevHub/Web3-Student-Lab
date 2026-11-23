import Ioredis, { Cluster } from 'ioredis';
import {
  REDIS_FAILOVER_BUDGET_MS,
  REDIS_MODE,
  redisClusterConfig,
  redisConfig,
  redisSentinelConfig,
} from '../config/redis.config.js';
import logger from '../utils/logger.js';

type RedisClientType = InstanceType<typeof Ioredis.default> | InstanceType<typeof Cluster>;
type RedisMode = 'standalone' | 'cluster' | 'sentinel';

const PROBE_TIMEOUT_MS = 1000;

export interface RedisNodeProbe {
  /** `host:port` for topology nodes, or the pool client name. */
  node: string;
  role: 'client' | 'sentinel' | 'master' | 'replica';
  healthy: boolean;
  latencyMs: number;
  /** Master address as reported by a sentinel. */
  master?: string;
  error?: string;
}

export interface RedisFailoverStats {
  lastFailoverAt: string | null;
  lastRecoveryMs: number | null;
  budgetMs: number;
  withinBudget: boolean;
}

export interface RedisTopologyHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  mode: RedisMode;
  master: string | null;
  nodes: RedisNodeProbe[];
  failover: RedisFailoverStats;
  checkedAt: string;
}

/**
 * Reduce individual node probes into an overall status (BE-004).
 *
 *  - unhealthy: the main pool client cannot reach the master.
 *  - degraded:  traffic flows, but redundancy is impaired — a pub/sub client or
 *               sentinel is down, sentinels disagree on the master, or fewer
 *               than a majority of sentinels are reachable (no failover quorum).
 */
export function summarizeTopology(
  nodes: RedisNodeProbe[]
): Pick<RedisTopologyHealth, 'status' | 'master'> {
  const main = nodes.find((n) => n.role === 'client' && n.node === 'main');
  if (!main || !main.healthy) {
    return { status: 'unhealthy', master: null };
  }

  const sentinels = nodes.filter((n) => n.role === 'sentinel');
  const reachable = sentinels.filter((n) => n.healthy);
  const masters = new Set(reachable.map((n) => n.master).filter(Boolean));
  const master = masters.size === 1 ? [...masters][0]! : null;

  const quorum = Math.floor(sentinels.length / 2) + 1;
  const degraded =
    nodes.some((n) => !n.healthy) ||
    (sentinels.length > 0 && (reachable.length < quorum || masters.size !== 1));

  return { status: degraded ? 'degraded' : 'healthy', master };
}

async function timedProbe(
  node: string,
  role: RedisNodeProbe['role'],
  fn: () => Promise<Partial<RedisNodeProbe> | void>
): Promise<RedisNodeProbe> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const extra = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`probe timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
      }),
    ]);
    return { node, role, healthy: true, latencyMs: Date.now() - start, ...(extra || {}) };
  } catch (error) {
    return {
      node,
      role,
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class RedisClient {
  private static instance: RedisClient;
  private client: RedisClientType | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private memoryStore = new Map<string, string>();
  private isConnected = false;
  private mode: RedisMode = 'standalone';
  private disconnectedAt: number | null = null;
  private lastFailoverAt: number | null = null;
  private lastRecoveryMs: number | null = null;

  private constructor() {
    this.mode = REDIS_MODE;
  }

  static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  async connect(): Promise<void> {
    if (this.client && this.isConnected) return;

    try {
      switch (this.mode) {
        case 'cluster':
          this.client = new Cluster(redisClusterConfig.nodes, redisClusterConfig.options as any);
          // For cluster mode, pub/sub clients use the same cluster instance
          this.pubClient = this.client;
          this.subClient = this.client;
          logger.info('Connecting to Redis Cluster...');
          break;
        case 'sentinel':
          this.client = new (Ioredis as any)(redisSentinelConfig as any);
          // Create separate pub/sub clients for sentinel mode
          this.pubClient = new (Ioredis as any)(redisSentinelConfig as any);
          this.subClient = new (Ioredis as any)(redisSentinelConfig as any);
          logger.info('Connecting to Redis Sentinel...');
          break;
        default:
          if (process.env.REDIS_URL) {
            this.client = new (Ioredis as any)(process.env.REDIS_URL, redisConfig);
          } else {
            this.client = new (Ioredis as any)(redisConfig);
          }
          // For standalone mode, create separate pub/sub clients for BullMQ/WebSocket
          if (process.env.REDIS_URL) {
            this.pubClient = new (Ioredis as any)(process.env.REDIS_URL, redisConfig);
            this.subClient = new (Ioredis as any)(process.env.REDIS_URL, redisConfig);
          } else {
            this.pubClient = new (Ioredis as any)(redisConfig);
            this.subClient = new (Ioredis as any)(redisConfig);
          }
          logger.info('Connecting to standalone Redis...');
      }

      this.client!.on('connect', () => {
        this.isConnected = true;
        logger.info(`Redis (${this.mode}) connected successfully`);
      });

      this.client!.on('ready', () => {
        this.isConnected = true;
        this.recordRecovery();
        logger.info(`Redis (${this.mode}) ready`);
      });

      this.client!.on('error', (err: Error) => {
        logger.error(`Redis (${this.mode}) connection error:`, err);
        this.markDisconnected();
      });

      this.client!.on('close', () => {
        this.markDisconnected();
        logger.warn(`Redis (${this.mode}) connection closed`);
      });

      this.client!.on('reconnecting', (time: number) => {
        logger.warn(`Redis (${this.mode}) reconnecting after ${time}ms`);
      });

      // Setup pub/sub client error handlers
      if (this.pubClient && this.pubClient !== this.client) {
        this.pubClient!.on('error', (err: Error) => {
          logger.error('Redis pubClient error:', err);
        });
      }
      if (this.subClient && this.subClient !== this.client) {
        this.subClient!.on('error', (err: Error) => {
          logger.error('Redis subClient error:', err);
        });
      }

      // For cluster mode, listen to cluster events
      if (this.mode === 'cluster' && this.client instanceof Cluster) {
        this.client.on('node error', (err, node) => {
          logger.error(`Redis cluster node error (${node}):`, err);
        });
        this.client.on('clusterDown', () => {
          logger.warn('Redis cluster is down');
          this.markDisconnected();
        });
      }

      // Verify connection
      await this.ping();
    } catch (error) {
      logger.error(`Failed to initialize Redis client (${this.mode}):`, error);
      this.client = null;
      this.pubClient = null;
      this.subClient = null;
      this.isConnected = false;
    }
  }

  async ping(): Promise<void> {
    if (!this.client) return;
    try {
      const result = await this.client.ping();
      if (result === 'PONG') {
        this.isConnected = true;
      }
    } catch (error) {
      logger.error('Redis ping failed:', error);
      this.isConnected = false;
    }
  }

  getClient(): RedisClientType | null {
    return this.isConnected ? this.client : null;
  }

  getClientOrThrow(): RedisClientType {
    const client = this.getClient();
    if (!client) {
      throw new Error('Redis client is not initialized or is disconnected');
    }
    return client;
  }

  getMemoryStore(): Map<string, string> {
    return this.memoryStore;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  getMode(): string {
    return this.mode;
  }

  private markDisconnected(): void {
    if (this.isConnected && this.disconnectedAt === null) {
      this.disconnectedAt = Date.now();
    }
    this.isConnected = false;
  }

  /**
   * Measure how long the client was unable to serve traffic. In sentinel and
   * cluster mode this is the client-observed failover time, which must stay
   * under {@link REDIS_FAILOVER_BUDGET_MS}.
   */
  private recordRecovery(): void {
    if (this.disconnectedAt === null) return;
    const now = Date.now();
    this.lastRecoveryMs = now - this.disconnectedAt;
    this.lastFailoverAt = this.disconnectedAt;
    this.disconnectedAt = null;

    const detail = { mode: this.mode, recoveryMs: this.lastRecoveryMs, budgetMs: REDIS_FAILOVER_BUDGET_MS };
    if (this.lastRecoveryMs > REDIS_FAILOVER_BUDGET_MS) {
      logger.warn('Redis failover recovery exceeded budget', detail);
    } else {
      logger.info('Redis recovered from connection loss', detail);
    }
  }

  getFailoverStats(): RedisFailoverStats {
    return {
      lastFailoverAt: this.lastFailoverAt ? new Date(this.lastFailoverAt).toISOString() : null,
      lastRecoveryMs: this.lastRecoveryMs,
      budgetMs: REDIS_FAILOVER_BUDGET_MS,
      withinBudget: this.lastRecoveryMs === null || this.lastRecoveryMs <= REDIS_FAILOVER_BUDGET_MS,
    };
  }

  /**
   * Health probe across the whole topology (BE-004): every pooled client
   * (main, pub, sub), every configured sentinel and — in cluster mode — every
   * cluster node. Sentinels are probed with short-lived connections so a dead
   * sentinel is reported even when the data path is still healthy.
   */
  async checkTopologyHealth(): Promise<RedisTopologyHealth> {
    const pool: Array<[string, RedisClientType | null]> = [['main', this.client]];
    if (this.pubClient && this.pubClient !== this.client) pool.push(['pub', this.pubClient]);
    if (this.subClient && this.subClient !== this.client) pool.push(['sub', this.subClient]);

    const probes: Array<Promise<RedisNodeProbe>> = pool.map(([name, client]) =>
      timedProbe(name, 'client', async () => {
        if (!client) throw new Error('client not initialized');
        // A subscriber connection only accepts (P)SUBSCRIBE/PING in RESP2, so
        // check its connection status rather than issuing a command.
        if (name === 'sub' && 'status' in client && client.status !== 'ready') {
          throw new Error(`connection status ${client.status}`);
        }
        if (name !== 'sub') await client.ping();
      })
    );

    if (this.mode === 'sentinel') {
      probes.push(...redisSentinelConfig.sentinels.map((s) => this.probeSentinel(s.host, s.port)));
    }

    if (this.mode === 'cluster' && this.client instanceof Cluster) {
      const masters = new Set(this.client.nodes('master'));
      probes.push(
        ...this.client.nodes('all').map((node) =>
          timedProbe(`${node.options.host}:${node.options.port}`, masters.has(node) ? 'master' : 'replica', async () => {
            await node.ping();
          })
        )
      );
    }

    const nodes = await Promise.all(probes);
    return {
      ...summarizeTopology(nodes),
      mode: this.mode,
      nodes,
      failover: this.getFailoverStats(),
      checkedAt: new Date().toISOString(),
    };
  }

  private probeSentinel(host: string, port: number): Promise<RedisNodeProbe> {
    return timedProbe(`${host}:${port}`, 'sentinel', async () => {
      const sentinel = new (Ioredis as any)({
        host,
        port,
        password: redisSentinelConfig.sentinelPassword,
        lazyConnect: true,
        connectTimeout: PROBE_TIMEOUT_MS,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      sentinel.on('error', () => undefined);
      try {
        await sentinel.connect();
        const addr = (await sentinel.call('SENTINEL', 'get-master-addr-by-name', redisSentinelConfig.name)) as
          | [string, string]
          | null;
        if (!addr) throw new Error(`sentinel does not know master "${redisSentinelConfig.name}"`);
        return { master: `${addr[0]}:${addr[1]}` };
      } finally {
        sentinel.disconnect();
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (error) {
        logger.warn('Error during Redis disconnect:', error);
        // Force disconnect if quit fails
        await this.client.disconnect();
      }
    }

    if (this.pubClient && this.pubClient !== this.client) {
      try {
        await this.pubClient.quit();
      } catch (error) {
        logger.warn('Error during Redis pubClient disconnect:', error);
      }
    }

    if (this.subClient && this.subClient !== this.client) {
      try {
        await this.subClient.quit();
      } catch (error) {
        logger.warn('Error during Redis subClient disconnect:', error);
      }
    }

    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;
    this.memoryStore.clear();
  }

  /**
   * Get connection info/stats
   */
  async getConnectionInfo(): Promise<Record<string, any>> {
    if (!this.client) {
      return { connected: false, mode: this.mode };
    }

    try {
      const info = await this.client.info();
      return {
        connected: this.isConnected,
        mode: this.mode,
        info: info.substring(0, 500), // Limit info output
      };
    } catch (error) {
      return {
        connected: this.isConnected,
        mode: this.mode,
        error: String(error),
      };
    }
  }

  /**
   * Get pub/sub clients for BullMQ and WebSocket
   */
  getPubClient(): RedisClientType | null {
    return this.pubClient || this.client;
  }

  getSubClient(): RedisClientType | null {
    return this.subClient || this.client;
  }

  /**
   * Get a client compatible with BullMQ (alias for main client)
   */
  getBullMQClient(): RedisClientType | null {
    return this.client;
  }
}

export default RedisClient.getInstance();
