import { beforeEach, describe, expect, it, vi } from 'vitest';

const memTagSets: Record<string, Set<string>> = {};
const deleted: string[] = [];

const mockSadd = vi.fn(async (key: string, val: string) => {
  (memTagSets[key] ??= new Set()).add(val);
  return 1;
});
const mockSmembers = vi.fn(async (key: string) => [...(memTagSets[key] ?? new Set())]);
const publishMock = vi.fn(async () => 0);

// Mock RedisClient's singleton.
vi.mock('./RedisClient.js', () => ({
  __esModule: true,
  default: {
    getClient: () => ({
      sadd: mockSadd,
      smembers: mockSmembers,
      pipeline: () => ({
        del: (k: string) => {
          deleted.push(k);
          return { exec: async () => [] };
        },
        exec: async () => [],
      }),
      del: async (...keys: string[]) => {
        deleted.push(...keys);
        return keys.length;
      },
    }),
    getPubClient: () => ({ publish: publishMock }) as unknown as { publish: typeof publishMock },
  },
}));

// Mock CacheService to record dels without touching Redis.
vi.mock('./CacheService.js', () => ({
  __esModule: true,
  default: {
    del: async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((k) => deleted.push(k));
    },
    getMetrics: () => ({ hits: 0, misses: 0, hitRate: '0.00%' }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(memTagSets)) delete memTagSets[k];
  deleted.length = 0;
});

describe('tag-based cache invalidation (issue #1130)', () => {
  it('registers a cache key against an entity tag', async () => {
    const { registerTag } = await import('./TagCacheInvalidator.js');
    await registerTag('course:123', 'course:curriculum:123');
    expect(mockSadd).toHaveBeenCalledWith('tag:course:123', 'course:curriculum:123');
  });

  it('purges all keys registered against multiple tags in one pipeline', async () => {
    const { registerTag, invalidateTags } = await import('./TagCacheInvalidator.js');
    await registerTag('course:123', 'course:curriculum:123');
    await registerTag('course:123', 'courses:list');
    await registerTag('module:456', 'course:curriculum:123');

    const result = await invalidateTags(['course:123', 'module:456']);

    expect(result.keysPurged).toBe(2); // course:curriculum:123 + courses:list (module tag adds curriculum again)
    expect(deleted).toContain('course:curriculum:123');
    expect(deleted).toContain('courses:list');
  });

  it('broadcasts a cross-instance invalidation message', async () => {
    const { broadcastInvalidation } = await import('./TagCacheInvalidator.js');
    await broadcastInvalidation(['course:123'], new Set(['course:curriculum:123']));
    expect(publishMock).toHaveBeenCalled();
    const channel = 'cache:invalidate:tags';
    const payload = JSON.parse(publishMock.mock.calls[0][1]);
    expect(payload.tags).toEqual(['course:123']);
    void channel;
  });

  it('clears stale keys and tag sets from an incoming broadcast', async () => {
    const { handleTagInvalidationMessage } = await import('./TagCacheInvalidator.js');
    await handleTagInvalidationMessage(
      JSON.stringify({ tags: ['course:123'], keys: ['course:curriculum:123'] })
    );
    expect(deleted).toContain('course:curriculum:123');
    expect(deleted).toContain('tag:course:123');
  });
});