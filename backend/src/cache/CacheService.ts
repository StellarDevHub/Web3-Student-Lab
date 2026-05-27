import redisClient from './RedisClient.js';
import logger from '../utils/logger.js';

export const CACHE_KEYS = {
  user: {
    profile: (userId: string) => `user:profile:${userId}`,
    progress: (userId: string) => `user:progress:${userId}`,
    certificates: (userId: string) => `user:certs:${userId}`,
  },
  courses: {
    list: () => 'courses:list',
    detail: (courseId: string) => `course:${courseId}`,
    curriculum: (courseId: string) => `course:curriculum:${courseId}`,
  },
  leaderboard: {
    global: () => 'leaderboard:global',
    weekly: () => 'leaderboard:weekly',
  },
};

class CacheService {
  private metrics = {
    hits: 0,
    misses: 0,
  };

  async get<T>(key: string): Promise<T | null> {
    const client = redisClient.getClient();

    try {
      const data = client ? await client.get(key) : (redisClient.getMemoryStore().get(key) ?? null);
      if (data) {
        this.metrics.hits++;
        return JSON.parse(data) as T;
      }
      this.metrics.misses++;
      return null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      this.metrics.misses++;
      return null;
    }
  }

  async set(key: string, value: unknown, ttl: number): Promise<void> {
    const client = redisClient.getClient();

    try {
      if (client) {
        await client.setex(key, ttl, JSON.stringify(value));
      } else {
        redisClient.getMemoryStore().set(key, JSON.stringify(value));
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  async del(key: string | string[]): Promise<void> {
    const client = redisClient.getClient();
    const keys = Array.isArray(key) ? key : [key];

    try {
      if (client) {
        await client.del(...keys);
      } else {
        keys.forEach((item) => redisClient.getMemoryStore().delete(item));
      }
    } catch (error) {
      logger.error(`Cache delete error:`, error);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    const client = redisClient.getClient();

    try {
      const keys = client
        ? await client.keys(pattern)
        : Array.from(redisClient.getMemoryStore().keys()).filter((key) =>
            key.includes(pattern.replace(/\*/g, ''))
          );
      if (keys.length > 0) {
        if (client) {
          await client.del(...keys);
        } else {
          keys.forEach((key) => redisClient.getMemoryStore().delete(key));
        }
      }
    } catch (error) {
      logger.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;
    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: hitRate.toFixed(2) + '%',
    };
  }

  resetMetrics() {
    this.metrics.hits = 0;
    this.metrics.misses = 0;
  }
}

export default new CacheService();
