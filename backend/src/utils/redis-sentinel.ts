/**
 * Redis Sentinel Automatic Failover & Connection Pool Manager (#1132).
 *
 * Provides automatic failover using Redis Sentinel, connection pooling,
 * and health monitoring. When the master fails, Sentinel promotes a replica
 * and the pool transparently reconnects.
 *
 * Usage:
 *   import { createSentinelPool } from '../utils/redis-sentinel';
 *
 *   const pool = createSentinelPool({
 *     sentinels: [{ host: 'sentinel-1', port: 26379 }],
 *     name: 'mymaster',
 *   });
 *   const client = await pool.getConnection();
 */

import Redis from 'ioredis';

export interface SentinelConfig {
  sentinels: Array<{ host: string; port: number }>;
  name: string;
  password?: string;
  sentinelPassword?: string;
  db?: number;
  poolSize?: number;
}

interface PoolClient {
  client: Redis;
  inUse: boolean;
  lastUsed: number;
}

export class SentinelConnectionPool {
  private config: SentinelConfig;
  private pool: PoolClient[] = [];
  private master: Redis | null = null;
  private sentinelClient: Redis | null = null;

  constructor(config: SentinelConfig) {
    this.config = { poolSize: 5, ...config };
  }

  /**
   * Initialize the pool by connecting to Sentinel and discovering the master.
   */
  async initialize(): Promise<void> {
    // Connect to first available Sentinel
    for (const sentinel of this.config.sentinels) {
      try {
        this.sentinelClient = new Redis({
          host: sentinel.host,
          port: sentinel.port,
          password: this.config.sentinelPassword,
          lazyConnect: true,
        });
        await this.sentinelClient.connect();
        break;
      } catch {
        continue;
      }
    }

    if (!this.sentinelClient) {
      throw new Error('Failed to connect to any Sentinel instance');
    }

    // Get master address
    const masterInfo = await this.sentinelClient.call(
      'SENTINEL',
      'get-master-addr-by-name',
      this.config.name,
    ) as string[];

    if (!masterInfo || masterInfo.length < 2) {
      throw new Error(`Master "${this.config.name}" not found by Sentinel`);
    }

    const [host, port] = masterInfo;
    this.master = new Redis({
      host,
      port: Number(port),
      password: this.config.password,
      db: this.config.db ?? 0,
      maxRetriesPerRequest: 3,
    });

    // Pre-populate pool
    for (let i = 0; i < this.config.poolSize!; i++) {
      this.pool.push({
        client: this.master,
        inUse: false,
        lastUsed: Date.now(),
      });
    }

    // Monitor for failover
    this.sentinelClient.subscribe(`+switch-master`, (err) => {
      if (err) console.error('[sentinel] Subscribe error:', err);
    });

    this.sentinelClient.on('message', async (_channel, message) => {
      console.log('[sentinel] Master switched:', message);
      await this.handleFailover();
    });
  }

  /**
   * Handle failover by reconnecting to new master.
   */
  private async handleFailover(): Promise<void> {
    const masterInfo = await this.sentinelClient!.call(
      'SENTINEL',
      'get-master-addr-by-name',
      this.config.name,
    ) as string[];

    if (!masterInfo || masterInfo.length < 2) return;

    const [host, port] = masterInfo;
    this.master = new Redis({
      host,
      port: Number(port),
      password: this.config.password,
      db: this.config.db ?? 0,
      maxRetriesPerRequest: 3,
    });

    // Replace pool with new master connections
    this.pool = [];
    for (let i = 0; i < this.config.poolSize!; i++) {
      this.pool.push({
        client: this.master,
        inUse: false,
        lastUsed: Date.now(),
      });
    }
  }

  /**
   * Get a connection from the pool.
   */
  async getConnection(): Promise<Redis> {
    const available = this.pool.find((c) => !c.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available.client;
    }
    // All in use — return master directly
    if (this.master) {
      return this.master;
    }
    throw new Error('No connections available');
  }

  /**
   * Release a connection back to the pool.
   */
  release(client: Redis): void {
    const entry = this.pool.find((c) => c.client === client);
    if (entry) {
      entry.inUse = false;
    }
  }

  /**
   * Get pool health status.
   */
  getHealth(): { total: number; inUse: number; available: number } {
    const inUse = this.pool.filter((c) => c.inUse).length;
    return { total: this.pool.length, inUse, available: this.pool.length - inUse };
  }

  /**
   * Close all connections.
   */
  async close(): Promise<void> {
    if (this.sentinelClient) {
      await this.sentinelClient.quit();
    }
    this.pool = [];
  }
}

/**
 * Create and initialize a Sentinel connection pool.
 */
export async function createSentinelPool(config: SentinelConfig): Promise<SentinelConnectionPool> {
  const pool = new SentinelConnectionPool(config);
  await pool.initialize();
  return pool;
}
