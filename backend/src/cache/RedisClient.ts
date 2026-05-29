import Redis, { Cluster } from 'ioredis';
import { REDIS_MODE, redisClusterConfig, redisConfig, redisSentinelConfig } from '../config/redis.config.js';
import logger from '../utils/logger.js';

type RedisClientType = Redis | Cluster;

class RedisClient {
  private static instance: RedisClient;
  private client: RedisClientType | null = null;
  private memoryStore = new Map<string, string>();
  private isConnected = false;
  private mode: 'standalone' | 'cluster' | 'sentinel' = 'standalone';

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
          logger.info('Connecting to Redis Cluster...');
          break;
        case 'sentinel':
          this.client = new Redis(redisSentinelConfig as any);
          logger.info('Connecting to Redis Sentinel...');
          break;
        default:
          this.client = new Redis(redisConfig);
          logger.info('Connecting to standalone Redis...');
      }

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info(`Redis (${this.mode}) connected successfully`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        logger.info(`Redis (${this.mode}) ready`);
      });

      this.client.on('error', (err) => {
        logger.error(`Redis (${this.mode}) connection error:`, err);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn(`Redis (${this.mode}) connection closed`);
      });

      this.client.on('reconnecting', (time: number) => {
        logger.warn(`Redis (${this.mode}) reconnecting after ${time}ms`);
      });

      // For cluster mode, listen to cluster events
      if (this.mode === 'cluster' && this.client instanceof Cluster) {
        this.client.on('node error', (err, node) => {
          logger.error(`Redis cluster node error (${node}):`, err);
        });
        this.client.on('clusterDown', () => {
          logger.warn('Redis cluster is down');
          this.isConnected = false;
        });
      }

      // Verify connection
      await this.ping();
    } catch (error) {
      logger.error(`Failed to initialize Redis client (${this.mode}):`, error);
      this.client = null;
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

  getMemoryStore(): Map<string, string> {
    return this.memoryStore;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  getMode(): string {
    return this.mode;
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

    this.client = null;
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
}

export default RedisClient.getInstance();
