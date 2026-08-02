import logger from '../utils/logger.js';
import redisClient from './RedisClient.js';

export const CACHE_KEYS = {
  user: {
    profile: (userId: string) => `user:profile:${userId}`,
    progress: (userId: string) => `user:progress:${userId}`,
    certificates: (userId: string) => `user:certs:${userId}`,
    onChainData: (userId: string) => `user:onchain:${userId}`,
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
  blockchain: {
    latestBlock: () => 'blockchain:latest-block',
    blockByHeight: (height: number) => `blockchain:block:${height}`,
    account: (address: string) => `account:${address}`,
    balance: (address: string) => `account:balance:${address}`,
    contractState: (contractId: string) => `contract:state:${contractId}`,
    contractData: (contractId: string, key: string) => `contract:data:${contractId}:${key}`,
    transaction: (txHash: string) => `transaction:${txHash}`,
    transactionStatus: (txHash: string) => `transaction:status:${txHash}`,
    tokenMetadata: (tokenId: string) => `token:metadata:${tokenId}`,
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

  /**
   * Cache blockchain account data
   */
  async cacheAccountData(
    address: string,
    data: any,
    ttl: number = 30
  ): Promise<void> {
    try {
      const key = CACHE_KEYS.blockchain.account(address);
      await this.set(key, data, ttl);
      logger.debug(`Cached account data for ${address}`);
    } catch (error) {
      logger.error(`Error caching account data for ${address}:`, error);
    }
  }

  /**
   * Get cached blockchain account data
   */
  async getAccountData(address: string): Promise<any | null> {
    try {
      const key = CACHE_KEYS.blockchain.account(address);
      return await this.get(key);
    } catch (error) {
      logger.error(`Error retrieving account data for ${address}:`, error);
      return null;
    }
  }

  /**
   * Cache contract state
   */
  async cacheContractState(
    contractId: string,
    state: any,
    ttl: number = 60
  ): Promise<void> {
    try {
      const key = CACHE_KEYS.blockchain.contractState(contractId);
      await this.set(key, state, ttl);
      logger.debug(`Cached contract state for ${contractId}`);
    } catch (error) {
      logger.error(`Error caching contract state for ${contractId}:`, error);
    }
  }

  /**
   * Get cached contract state
   */
  async getContractState(contractId: string): Promise<any | null> {
    try {
      const key = CACHE_KEYS.blockchain.contractState(contractId);
      return await this.get(key);
    } catch (error) {
      logger.error(`Error retrieving contract state for ${contractId}:`, error);
      return null;
    }
  }

  /**
   * Cache transaction status
   */
  async cacheTransactionStatus(
    txHash: string,
    status: any,
    ttl: number = 120
  ): Promise<void> {
    try {
      const key = CACHE_KEYS.blockchain.transactionStatus(txHash);
      await this.set(key, status, ttl);
      logger.debug(`Cached transaction status for ${txHash}`);
    } catch (error) {
      logger.error(`Error caching transaction status for ${txHash}:`, error);
    }
  }

  /**
   * Get cached transaction status
   */
  async getTransactionStatus(txHash: string): Promise<any | null> {
    try {
      const key = CACHE_KEYS.blockchain.transactionStatus(txHash);
      return await this.get(key);
    } catch (error) {
      logger.error(`Error retrieving transaction status for ${txHash}:`, error);
      return null;
    }
  }

  /**
   * Invalidate all blockchain caches
   */
  async invalidateBlockchainCache(): Promise<void> {
    try {
      await Promise.all([
        this.delPattern('blockchain:*'),
        this.delPattern('account:*'),
        this.delPattern('contract:*'),
        this.delPattern('transaction:*'),
        this.delPattern('token:*'),
      ]);
      logger.info('Invalidated all blockchain caches');
    } catch (error) {
      logger.error('Error invalidating blockchain caches:', error);
    }
  }

  resetMetrics() {
    this.metrics.hits = 0;
    this.metrics.misses = 0;
  }
}

export default new CacheService();
