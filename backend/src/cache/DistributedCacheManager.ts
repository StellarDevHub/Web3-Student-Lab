import logger from '../utils/logger.js';
import cacheService from './CacheService.js';
import redisClient from './RedisClient.js';

/**
 * Manages distributed caching operations across Redis clusters
 * Handles synchronization and coordination of cache updates
 */
export class DistributedCacheManager {
  private pubsubClient = redisClient.getClient();
  private subscribers = new Map<string, Set<(data: any) => void>>();

  /**
   * Publish cache invalidation event to all instances
   */
  async publishCacheInvalidation(pattern: string, data?: any): Promise<void> {
    try {
      const channel = `cache:invalidate:${pattern}`;
      const payload = JSON.stringify({
        pattern,
        data,
        timestamp: Date.now(),
        instanceId: process.env.INSTANCE_ID || 'unknown',
      });

      const client = redisClient.getClient();
      if (client) {
        const subscribers = await client.publish(channel, payload);
        logger.debug(`Published cache invalidation: ${pattern} to ${subscribers} subscribers`);
      }
    } catch (error) {
      logger.error('Error publishing cache invalidation:', error);
    }
  }

  /**
   * Subscribe to cache invalidation events
   */
  async subscribeToCacheInvalidation(
    pattern: string,
    callback: (data: any) => Promise<void>
  ): Promise<void> {
    try {
      const channel = `cache:invalidate:${pattern}`;

      if (!this.subscribers.has(pattern)) {
        this.subscribers.set(pattern, new Set());
      }
      this.subscribers.get(pattern)!.add(callback);

      logger.info(`Subscribed to cache invalidation channel: ${channel}`);
    } catch (error) {
      logger.error('Error subscribing to cache invalidation:', error);
    }
  }

  /**
   * Distribute cache data across cluster nodes
   */
  async distributeCacheData(key: string, value: any, ttl: number): Promise<void> {
    try {
      // Set in local cache
      await cacheService.set(key, value, ttl);

      // Notify other instances via pub/sub
      await this.publishCacheInvalidation(key, {
        action: 'update',
        value,
        ttl,
      });

      logger.debug(`Distributed cache data for key: ${key}`);
    } catch (error) {
      logger.error('Error distributing cache data:', error);
    }
  }

  /**
   * Synchronize cache across all cluster nodes
   */
  async synchronizeCacheAcrossCluster(pattern: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) {
        logger.warn('Redis client not available for cache synchronization');
        return;
      }

      // Get all keys matching pattern
      const keys = await client.keys(pattern);
      logger.info(`Synchronizing ${keys.length} cache entries across cluster for pattern: ${pattern}`);

      // Publish sync event to all cluster nodes
      await this.publishCacheInvalidation(`sync:${pattern}`, {
        action: 'sync',
        pattern,
        keyCount: keys.length,
      });
    } catch (error) {
      logger.error('Error synchronizing cache across cluster:', error);
    }
  }

  /**
   * Get cache statistics across cluster
   */
  async getCacheStatistics(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate: number;
    evictions: number;
  }> {
    try {
      const client = redisClient.getClient();
      if (!client) {
        return {
          totalKeys: 0,
          memoryUsage: 'N/A',
          hitRate: 0,
          evictions: 0,
        };
      }

      const info = await client.info('stats');
      const memoryInfo = await client.info('memory');

      const lines = info.split('\r\n');
      const memoryLines = memoryInfo.split('\r\n');

      let keyspace = 0;
      let hits = 0;
      let misses = 0;
      let evictions = 0;
      let memoryUsage = 'N/A';

      lines.forEach((line) => {
        if (line.includes('keyspace_hits')) hits = parseInt(line.split(':')[1]);
        if (line.includes('keyspace_misses')) misses = parseInt(line.split(':')[1]);
        if (line.includes('evicted_keys')) evictions = parseInt(line.split(':')[1]);
      });

      memoryLines.forEach((line) => {
        if (line.includes('used_memory_human')) memoryUsage = line.split(':')[1];
      });

      const keyspaceInfo = await client.info('keyspace');
      const dbMatch = keyspaceInfo.match(/keys=(\d+)/);
      if (dbMatch) keyspace = parseInt(dbMatch[1]);

      const hitRate = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;

      return {
        totalKeys: keyspace,
        memoryUsage,
        hitRate: Math.round(hitRate * 100) / 100,
        evictions,
      };
    } catch (error) {
      logger.error('Error getting cache statistics:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'N/A',
        hitRate: 0,
        evictions: 0,
      };
    }
  }

  /**
   * Handle graceful cache drain before shutdown
   */
  async gracefulShutdown(): Promise<void> {
    try {
      logger.info('Starting graceful cache shutdown');

      // Publish shutdown notification
      await this.publishCacheInvalidation('cluster:shutdown', {
        instanceId: process.env.INSTANCE_ID || 'unknown',
        timestamp: Date.now(),
      });

      // Wait for any pending operations
      await new Promise((resolve) => setTimeout(resolve, 1000));

      logger.info('Graceful cache shutdown completed');
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
    }
  }
}

export default new DistributedCacheManager();
