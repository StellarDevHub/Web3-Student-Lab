import { Injectable, Logger } from '@nestjs/common';
import * as Redis from 'redis';

/**
 * BE-034: High-Performance In-Memory Caching Architecture with Redis Cache-Aside & Dogpile Prevention.
 * Prevents cache stampede (dogpile effect) when multiple queries hit expired cache simultaneously.
 */
@Injectable()
export class RedisCacheAsideService {
  private readonly logger = new Logger(RedisCacheAsideService.name);
  private redisClient: Redis.RedisClient;
  private lockTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // Configuration
  private readonly LOCK_TIMEOUT = 5000; // 5 seconds for lock acquisition
  private readonly DEFAULT_TTL = 3600; // 1 hour default TTL
  private readonly LOCK_SUFFIX = ':__lock__';
  private readonly LOCKWAIT_SUFFIX = ':__lockwait__';

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    this.redisClient = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (options) => {
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Redis retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      },
    });

    this.redisClient.on('error', (err) => {
      this.logger.error(`Redis client error: ${err}`);
    });

    this.logger.log('Redis cache client initialized');
  }

  /**
   * Get value from cache or fetch from source with dogpile prevention.
   * Uses probabilistic early expiration to avoid cache stampede.
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL,
    probabilisticEarlyExpiration: number = 0.1,
  ): Promise<T> {
    // Try to get from cache
    const cachedValue = await this.getCached<T>(key);
    if (cachedValue !== null) {
      // Probabilistic early expiration: refresh cache before it expires
      if (Math.random() < probabilisticEarlyExpiration) {
        this.refreshInBackground(key, fetchFn, ttl);
      }
      return cachedValue;
    }

    // Cache miss - try to acquire lock for refresh
    const lockKey = key + this.LOCK_SUFFIX;
    const lockAcquired = await this.acquireLock(lockKey);

    if (lockAcquired) {
      try {
        // Double-check cache after acquiring lock
        const doubleCheckValue = await this.getCached<T>(key);
        if (doubleCheckValue !== null) {
          return doubleCheckValue;
        }

        // Fetch fresh data
        const freshValue = await fetchFn();

        // Store in cache
        await this.setCached(key, freshValue, ttl);

        return freshValue;
      } finally {
        // Release lock
        await this.releaseLock(lockKey);
        this.notifyWaiters(key);
      }
    } else {
      // Another process is already refreshing - wait for result
      return await this.waitForRefresh<T>(key, fetchFn, ttl);
    }
  }

  /**
   * Acquire distributed lock for cache refresh
   */
  private async acquireLock(lockKey: string): Promise<boolean> {
    return new Promise((resolve) => {
      const lockValue = `${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => resolve(false), this.LOCK_TIMEOUT);

      this.redisClient.set(lockKey, lockValue, 'PX', this.LOCK_TIMEOUT, 'NX', (err, reply) => {
        clearTimeout(timeout);
        resolve(!err && reply === 'OK');
      });
    });
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(lockKey: string): Promise<void> {
    return new Promise((resolve) => {
      this.redisClient.del(lockKey, () => resolve());
    });
  }

  /**
   * Wait for another process to complete cache refresh
   */
  private async waitForRefresh<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number,
  ): Promise<T> {
    const maxWaitTime = this.LOCK_TIMEOUT;
    const checkInterval = 100; // ms
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      const cachedValue = await this.getCached<T>(key);
      if (cachedValue !== null) {
        return cachedValue;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      elapsedTime += checkInterval;
    }

    // Timeout waiting - fetch ourselves as fallback
    return await fetchFn();
  }

  /**
   * Notify waiters that refresh is complete
   */
  private notifyWaiters(key: string): void {
    const waitKey = key + this.LOCKWAIT_SUFFIX;
    this.redisClient.publish(waitKey, 'ready');
  }

  /**
   * Refresh cache in background (for probabilistic early expiration)
   */
  private async refreshInBackground<T>(key: string, fetchFn: () => Promise<T>, ttl: number): Promise<void> {
    setImmediate(async () => {
      try {
        const freshValue = await fetchFn();
        await this.setCached(key, freshValue, ttl);
        this.logger.debug(`Background refresh completed for key: ${key}`);
      } catch (error) {
        this.logger.error(`Background refresh failed for key ${key}: ${error}`);
      }
    });
  }

  /**
   * Get cached value (internal)
   */
  private async getCached<T>(key: string): Promise<T | null> {
    return new Promise((resolve) => {
      this.redisClient.get(key, (err, reply) => {
        if (err) {
          this.logger.error(`Cache get failed for key ${key}: ${err}`);
          resolve(null);
          return;
        }

        if (!reply) {
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(reply));
        } catch (e) {
          this.logger.error(`Cache parse failed for key ${key}: ${e}`);
          resolve(null);
        }
      });
    });
  }

  /**
   * Set cached value (internal)
   */
  private async setCached<T>(key: string, value: T, ttl: number): Promise<void> {
    return new Promise((resolve) => {
      const serialized = JSON.stringify(value);
      this.redisClient.setex(key, ttl, serialized, (err) => {
        if (err) {
          this.logger.error(`Cache set failed for key ${key}: ${err}`);
        } else {
          this.logger.debug(`Cache set for key ${key} with TTL ${ttl}s`);
        }
        resolve();
      });
    });
  }

  /**
   * Invalidate cache key
   */
  async invalidate(key: string): Promise<void> {
    return new Promise((resolve) => {
      this.redisClient.del(key, () => resolve());
    });
  }

  /**
   * Invalidate keys matching pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    return new Promise((resolve) => {
      this.redisClient.keys(pattern, (err, keys) => {
        if (err || !keys || keys.length === 0) {
          resolve(0);
          return;
        }

        this.redisClient.del(...keys, (err, reply) => {
          resolve(!err ? reply : 0);
        });
      });
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ keys: number; memory: string; hitRate: number }> {
    return new Promise((resolve) => {
      this.redisClient.info('stats', (err, info) => {
        if (err) {
          resolve({ keys: 0, memory: '0B', hitRate: 0 });
          return;
        }

        // Parse Redis info
        const lines = info.split('\r\n');
        let hitRate = 0;

        for (const line of lines) {
          if (line.startsWith('keyspace_hits:')) {
            const hits = parseInt(line.split(':')[1]);
            const misses = parseInt(lines.find((l) => l.startsWith('keyspace_misses:'))?.split(':')[1] || '1');
            hitRate = hits / (hits + misses);
          }
        }

        this.redisClient.dbsize((err, keys) => {
          this.redisClient.info('memory', (err, memInfo) => {
            const memLine = memInfo
              ?.split('\r\n')
              .find((l) => l.startsWith('used_memory_human:'));
            const memory = memLine?.split(':')[1] || '0B';

            resolve({
              keys: keys || 0,
              memory,
              hitRate,
            });
          });
        });
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const timeout of this.lockTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.redisClient.quit();
    this.logger.log('Redis cache client disconnected');
  }
}
