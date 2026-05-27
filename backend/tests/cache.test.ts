import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import redisClient from '../src/cache/RedisClient.js';
import cacheService, { CACHE_KEYS } from '../src/cache/CacheService.js';

describe('Cache Integration Tests', () => {
  beforeAll(async () => {
    await redisClient.connect();
  });

  afterAll(async () => {
    await redisClient.disconnect();
  });

  it('should set and get cache data', async () => {
    const key = 'test:key';
    const value = { name: 'Test', id: 123 };

    await cacheService.set(key, value, 60);
    const result = await cacheService.get(key);

    expect(result).toEqual(value);
  });

  it('should return null for non-existent key', async () => {
    const result = await cacheService.get('non:existent:key');
    expect(result).toBeNull();
  });

  it('should delete cache data', async () => {
    const key = 'test:delete';
    await cacheService.set(key, { data: 'test' }, 60);
    await cacheService.del(key);
    const result = await cacheService.get(key);

    expect(result).toBeNull();
  });

  it('should generate correct cache keys', () => {
    expect(CACHE_KEYS.user.profile('user123')).toBe('user:profile:user123');
    expect(CACHE_KEYS.courses.detail('course456')).toBe('course:course456');
    expect(CACHE_KEYS.courses.list()).toBe('courses:list');
  });

  it('should track cache metrics', async () => {
    cacheService.resetMetrics();

    await cacheService.get('miss:key');
    await cacheService.set('hit:key', { data: 'test' }, 60);
    await cacheService.get('hit:key');

    const metrics = cacheService.getMetrics();
    expect(metrics.hits).toBeGreaterThan(0);
    expect(metrics.misses).toBeGreaterThan(0);
  });
});
