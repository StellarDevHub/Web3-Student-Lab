import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config.js';
import logger from '../utils/logger.js';

class RedisClient {
  private static instance: RedisClient;
  private client: Redis | null = null;
  private memoryStore = new Map<string, string>();
  private isConnected = false;

  private constructor() {}

  static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  async connect(): Promise<void> {
    if (this.client && this.isConnected) return;

    try {
      this.client = new Redis(redisConfig);

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully');
      });

      this.client.on('error', (err) => {
        logger.error('Redis connection error:', err);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
      this.client = null;
      this.isConnected = true;
    }
  }

  getClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }

  getMemoryStore(): Map<string, string> {
    return this.memoryStore;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }

    this.client = null;
    this.isConnected = false;
    this.memoryStore.clear();
  }
}

export default RedisClient.getInstance();
