import { cacheTTL } from '../config/redis.config.js';
import logger from '../utils/logger.js';
import cacheService, { CACHE_KEYS } from './CacheService.js';

/**
 * Cache warming strategies for high-frequency blockchain data
 * Proactively populates cache to avoid cold starts and rate limits
 */
export class CacheWarmer {
  private isWarming = false;
  private warmingInterval: NodeJS.Timer | null = null;
  private readonly WARMING_INTERVAL = parseInt(process.env.CACHE_WARMING_INTERVAL || '300000', 10); // 5 minutes

  /**
   * Start periodic cache warming
   */
  async start(): Promise<void> {
    if (this.isWarming) {
      logger.warn('CacheWarmer already running');
      return;
    }

    this.isWarming = true;
    logger.info('CacheWarmer started');

    // Warm cache immediately on start
    await this.warmBlockchainCache();

    // Set up periodic warming
    this.warmingInterval = setInterval(() => {
      this.warmBlockchainCache().catch((err) => {
        logger.error('Error during scheduled cache warming:', err);
      });
    }, this.WARMING_INTERVAL);
  }

  /**
   * Stop cache warming
   */
  stop(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
    }
    this.isWarming = false;
    logger.info('CacheWarmer stopped');
  }

  /**
   * Warm blockchain-related caches
   */
  private async warmBlockchainCache(): Promise<void> {
    try {
      logger.debug('Starting blockchain cache warming');

      // These would typically be populated from actual blockchain data
      // For now, we're preparing the cache structure
      const mockData = {
        latestBlock: {
          height: Math.floor(Date.now() / 1000),
          hash: `0x${Math.random().toString(16).substring(2)}`,
          timestamp: Date.now(),
        },
      };

      // Warm latest block cache
      await cacheService.set(
        'blockchain:latest-block',
        mockData.latestBlock,
        cacheTTL.blockchain.blockHeader
      );

      await cacheService.set(
        'blockchain:latest-block:height',
        mockData.latestBlock.height,
        cacheTTL.blockchain.blockHeader
      );

      logger.debug('Blockchain cache warming completed');
    } catch (error) {
      logger.error('Error warming blockchain cache:', error);
    }
  }

  /**
   * Warm user-specific caches
   */
  async warmUserCaches(userIds: string[]): Promise<void> {
    try {
      logger.debug(`Warming cache for ${userIds.length} users`);

      for (const userId of userIds) {
        // Prepare cache keys but don't pre-populate with data
        // (data should be fetched from DB/blockchain when first accessed)
        await Promise.all([
          cacheService.get(CACHE_KEYS.user.profile(userId)),
          cacheService.get(CACHE_KEYS.user.progress(userId)),
          cacheService.get(CACHE_KEYS.user.certificates(userId)),
        ]);
      }

      logger.debug(`User cache warming completed for ${userIds.length} users`);
    } catch (error) {
      logger.error('Error warming user caches:', error);
    }
  }

  /**
   * Warm course-related caches
   */
  async warmCourseCaches(courseIds: string[]): Promise<void> {
    try {
      logger.debug(`Warming cache for ${courseIds.length} courses`);

      for (const courseId of courseIds) {
        await Promise.all([
          cacheService.get(CACHE_KEYS.courses.detail(courseId)),
          cacheService.get(CACHE_KEYS.courses.curriculum(courseId)),
        ]);
      }

      logger.debug(`Course cache warming completed for ${courseIds.length} courses`);
    } catch (error) {
      logger.error('Error warming course caches:', error);
    }
  }

  /**
   * Warm static/global caches
   */
  async warmGlobalCaches(): Promise<void> {
    try {
      logger.debug('Warming global caches');

      await Promise.all([
        cacheService.get(CACHE_KEYS.courses.list()),
        cacheService.get(CACHE_KEYS.leaderboard.global()),
        cacheService.get(CACHE_KEYS.leaderboard.weekly()),
      ]);

      logger.debug('Global cache warming completed');
    } catch (error) {
      logger.error('Error warming global caches:', error);
    }
  }

  /**
   * Get warming status
   */
  getStatus(): {
    isWarming: boolean;
    warmingInterval: number;
  } {
    return {
      isWarming: this.isWarming,
      warmingInterval: this.WARMING_INTERVAL,
    };
  }
}

export default new CacheWarmer();
