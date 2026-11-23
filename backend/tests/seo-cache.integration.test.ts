import {
    SeoCacheClient,
    SimulatorSeoService,
} from '../src/services/seo/simulatorSeo.service.js';

class FakeRedisCache implements SeoCacheClient {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly now: () => number,
    private shouldFail = false
  ) {}

  setFailureMode(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  async get(key: string): Promise<string | null> {
    if (this.shouldFail) {
      throw new Error('simulated packet loss');
    }

    const item = this.store.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= this.now()) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<string> {
    if (this.shouldFail) {
      throw new Error('simulated packet loss');
    }

    this.store.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('SimulatorSeoService cache integration', () => {
  let now = 0;
  let fetchCount = 0;
  let cache: FakeRedisCache;
  let service: SimulatorSeoService;

  const assetFactory = () => [
    {
      slug: 'consensus-lab',
      title: 'Consensus Lab',
      summary: 'Stress test finality assumptions.',
      tags: ['consensus'],
      updatedAt: '2026-01-10T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    now = 0;
    fetchCount = 0;
    cache = new FakeRedisCache(() => now);

    service = new SimulatorSeoService({
      cache,
      now: () => now,
      fetchAssetIndex: async () => {
        fetchCount += 1;
        return assetFactory();
      },
      fetchSitemapXml: async () =>
        `<?xml version=\"1.0\"?><urlset><url><loc>https://example.com/simulator/consensus-lab</loc></url></urlset>`,
      baseUrl: 'https://example.com',
    });
  });

  it('records cache miss then hit for asset index', async () => {
    await service.getAssetIndex();
    await service.getAssetIndex();

    const stats = service.getCacheStats();

    expect(fetchCount).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
  });

  it('re-fetches data after key expiration', async () => {
    await service.getAssetIndex();
    now += 121_000;
    await service.getAssetIndex();

    expect(fetchCount).toBe(2);
  });

  it('falls back gracefully when redis operations fail', async () => {
    cache.setFailureMode(true);

    const meta = await service.getMetaTags('consensus-lab');
    const urls = await service.getSitemapUrls();

    const stats = service.getCacheStats();

    expect(meta?.canonical).toBe('https://example.com/simulator/consensus-lab');
    expect(urls).toEqual(['https://example.com/simulator/consensus-lab']);
    expect(stats.fallbackWrites).toBeGreaterThan(0);
  });
});
