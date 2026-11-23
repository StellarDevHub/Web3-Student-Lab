import blockHeaderListener from '../src/cache/BlockHeaderListener';
import cacheService, { CACHE_KEYS } from '../src/cache/CacheService';
import cacheWarmer from '../src/cache/CacheWarmer';
import distributedCacheManager from '../src/cache/DistributedCacheManager';
import redisClient from '../src/cache/RedisClient';
import { cacheTTL } from '../src/config/redis.config';

describe('Distributed Caching Layer', () => {
  beforeAll(async () => {
    // Initialize Redis connection
    await redisClient.connect();
  });

  afterAll(async () => {
    // Clean up
    await redisClient.disconnect();
  });

  afterEach(async () => {
    // Clean cache between tests
    cacheService.resetMetrics();
  });

  describe('CacheService', () => {
    it('should store and retrieve data', async () => {
      const testKey = 'test:key';
      const testData = { id: 1, name: 'Test' };

      await cacheService.set(testKey, testData, 60);
      const retrieved = await cacheService.get(testKey);

      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent keys', async () => {
      const result = await cacheService.get('non:existent:key');
      expect(result).toBeNull();
    });

    it('should delete cached data', async () => {
      const testKey = 'test:delete:key';
      const testData = { test: true };

      await cacheService.set(testKey, testData, 60);
      await cacheService.del(testKey);
      const result = await cacheService.get(testKey);

      expect(result).toBeNull();
    });

    it('should delete by pattern', async () => {
      const keys = ['cache:pattern:1', 'cache:pattern:2', 'cache:pattern:3'];
      const data = { test: true };

      for (const key of keys) {
        await cacheService.set(key, data, 60);
      }

      await cacheService.delPattern('cache:pattern:*');

      for (const key of keys) {
        const result = await cacheService.get(key);
        expect(result).toBeNull();
      }
    });

    it('should track cache metrics', async () => {
      const testKey = 'metrics:test';
      const testData = { metrics: true };

      // Cache miss
      await cacheService.get('non:existent');

      // Cache hit
      await cacheService.set(testKey, testData, 60);
      await cacheService.get(testKey);

      const metrics = cacheService.getMetrics();

      expect(metrics.misses).toBeGreaterThan(0);
      expect(metrics.hits).toBeGreaterThan(0);
      expect(metrics.hitRate).toBeDefined();
    });
  });

  describe('Blockchain Cache Keys', () => {
    it('should cache account data', async () => {
      const address = '0x1234567890';
      const accountData = { balance: '1000', nonce: 5 };

      await cacheService.cacheAccountData(address, accountData, 30);
      const retrieved = await cacheService.getAccountData(address);

      expect(retrieved).toEqual(accountData);
    });

    it('should cache contract state', async () => {
      const contractId = 'CONTRACT_123';
      const state = { locked: false, owner: '0x123' };

      await cacheService.cacheContractState(contractId, state, 60);
      const retrieved = await cacheService.getContractState(contractId);

      expect(retrieved).toEqual(state);
    });

    it('should cache transaction status', async () => {
      const txHash = '0xABC123';
      const status = { confirmed: true, blockNumber: 12345 };

      await cacheService.cacheTransactionStatus(txHash, status, 120);
      const retrieved = await cacheService.getTransactionStatus(txHash);

      expect(retrieved).toEqual(status);
    });

    it('should invalidate all blockchain caches', async () => {
      // Set multiple blockchain caches
      await cacheService.cacheAccountData('0x123', { balance: '100' }, 30);
      await cacheService.cacheContractState('CONTRACT_1', { state: 'active' }, 60);

      // Verify they exist
      expect(await cacheService.getAccountData('0x123')).not.toBeNull();
      expect(await cacheService.getContractState('CONTRACT_1')).not.toBeNull();

      // Invalidate all
      await cacheService.invalidateBlockchainCache();

      // Verify they're cleared
      expect(await cacheService.getAccountData('0x123')).toBeNull();
      expect(await cacheService.getContractState('CONTRACT_1')).toBeNull();
    });
  });

  describe('BlockHeaderListener', () => {
    it('should start and stop listening', async () => {
      const listener = blockHeaderListener;

      await listener.start();
      let status = listener.getStatus();
      expect(status.isListening).toBe(true);

      listener.stop();
      status = listener.getStatus();
      expect(status.isListening).toBe(false);
    });

    it('should detect new blocks', (done) => {
      const listener = blockHeaderListener;
      let blockDetected = false;

      listener.onNewBlockDetected(async (blockHeight) => {
        expect(blockHeight).toBeGreaterThan(0);
        blockDetected = true;
      });

      // Set a new block height to simulate detection
      cacheService.set('blockchain:latest-block:height', 12345, 10).then(() => {
        // Wait a moment for detection
        setTimeout(() => {
          listener.stop();
          done();
        }, 100);
      });
    });
  });

  describe('CacheWarmer', () => {
    it('should have warming status methods', async () => {
      const warmer = cacheWarmer;
      const status = warmer.getStatus();

      expect(status).toHaveProperty('isWarming');
      expect(status).toHaveProperty('warmingInterval');
    });

    it('should warm global caches', async () => {
      const warmer = cacheWarmer;
      await warmer.warmGlobalCaches();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('DistributedCacheManager', () => {
    it('should get cache statistics', async () => {
      const manager = distributedCacheManager;
      const stats = await manager.getCacheStatistics();

      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('evictions');
    });

    it('should publish cache invalidation', async () => {
      const manager = distributedCacheManager;
      // Should not throw
      await manager.publishCacheInvalidation('test:pattern');
      expect(true).toBe(true);
    });
  });

  describe('RedisClient Connection', () => {
    it('should report healthy status', () => {
      const healthy = redisClient.isHealthy();
      // May be false if Redis not running, but should not throw
      expect(typeof healthy).toBe('boolean');
    });

    it('should provide connection info', async () => {
      const info = await redisClient.getConnectionInfo();

      expect(info).toHaveProperty('connected');
      expect(info).toHaveProperty('mode');
    });
  });

  describe('Cache TTL Configuration', () => {
    it('should have proper blockchain TTLs', () => {
      expect(cacheTTL.blockchain.blockHeader).toBeLessThan(30);
      expect(cacheTTL.blockchain.accountBalance).toBeLessThan(60);
      expect(cacheTTL.blockchain.contractState).toBeLessThan(120);
    });

    it('should have longer TTLs for static data', () => {
      expect(cacheTTL.courses.list).toBeGreaterThan(cacheTTL.courses.detail);
      expect(cacheTTL.leaderboard.global).toBeLessThan(cacheTTL.courses.list);
    });
  });

  describe('Cache Keys Format', () => {
    it('should generate correct user cache keys', () => {
      const userId = 'user123';

      expect(CACHE_KEYS.user.profile(userId)).toBe(`user:profile:${userId}`);
      expect(CACHE_KEYS.user.progress(userId)).toBe(`user:progress:${userId}`);
      expect(CACHE_KEYS.user.certificates(userId)).toBe(`user:certs:${userId}`);
    });

    it('should generate correct blockchain cache keys', () => {
      const address = '0x123';
      const contractId = 'CONTRACT_ID';
      const txHash = '0xABC';

      expect(CACHE_KEYS.blockchain.account(address)).toBe(`account:${address}`);
      expect(CACHE_KEYS.blockchain.contractState(contractId)).toBe(
        `contract:state:${contractId}`
      );
      expect(CACHE_KEYS.blockchain.transactionStatus(txHash)).toBe(
        `transaction:status:${txHash}`
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid data gracefully', async () => {
      const testKey = 'error:test';

      // This should not throw
      await cacheService.set(testKey, null, 60);
      const result = await cacheService.get(testKey);

      expect(result).toEqual(null);
    });

    it('should handle delete errors gracefully', async () => {
      // This should not throw
      await cacheService.del('non:existent:key');
      expect(true).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should perform fast cache operations', async () => {
      const startTime = performance.now();
      const operations = 1000;

      for (let i = 0; i < operations; i++) {
        await cacheService.set(`perf:test:${i}`, { data: i }, 60);
      }

      const endTime = performance.now();
      const timePerOp = (endTime - startTime) / operations;

      // Should be fast (less than 10ms per operation on average)
      expect(timePerOp).toBeLessThan(10);
    });
  });
});
