import redisClient from '../../cache/RedisClient.js';

export interface SimulatorAsset {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  updatedAt: string;
}

export interface SimulatorMetaTags {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogType: 'article';
}

export interface SeoCacheClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del?(key: string): Promise<unknown>;
}

export interface SeoServiceDependencies {
  cache?: SeoCacheClient;
  fetchAssetIndex?: () => Promise<SimulatorAsset[]>;
  fetchSitemapXml?: () => Promise<string>;
  now?: () => number;
  baseUrl?: string;
}

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

const DEFAULT_ASSETS: SimulatorAsset[] = [
  {
    slug: 'consensus-lab',
    title: 'Consensus Failure Recovery Simulator',
    summary: 'Model validator partitions and compare protocol convergence behavior in real time.',
    tags: ['consensus', 'validators', 'resilience'],
    updatedAt: '2026-01-10T00:00:00.000Z',
  },
  {
    slug: 'gas-optimization-arena',
    title: 'Gas Optimization Arena',
    summary: 'Benchmark contract patterns and detect expensive opcode paths before deployment.',
    tags: ['gas', 'smart-contracts', 'performance'],
    updatedAt: '2026-02-14T00:00:00.000Z',
  },
  {
    slug: 'fork-choice-playground',
    title: 'Fork Choice Playground',
    summary: 'Explore chain reorg scenarios and observe fork choice rules against adversarial peers.',
    tags: ['fork-choice', 'chain-reorg', 'security'],
    updatedAt: '2026-03-02T00:00:00.000Z',
  },
];

const DEFAULT_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://web3studentlab.dev/simulator/consensus-lab</loc></url>
  <url><loc>https://web3studentlab.dev/simulator/gas-optimization-arena</loc></url>
  <url><loc>https://web3studentlab.dev/simulator/fork-choice-playground</loc></url>
</urlset>`;

const ASSET_INDEX_CACHE_KEY = 'seo:simulator:asset-index:v1';
const SITEMAP_CACHE_KEY = 'seo:simulator:sitemap:v1';

function parseSitemapXml(xml: string): string[] {
  const matches = xml.matchAll(/<loc>(.*?)<\/loc>/g);
  return Array.from(matches, (match) => match[1]?.trim() ?? '').filter(Boolean);

}

function buildMetaTags(asset: SimulatorAsset, baseUrl: string): SimulatorMetaTags {
  return {
    title: `${asset.title} | Blockchain Learning Simulator`,
    description: asset.summary,
    keywords: asset.tags.join(', '),
    canonical: `${baseUrl.replace(/\/$/, '')}/simulator/${asset.slug}`,
    ogType: 'article',
  };
}

/** In-memory no-op cache used when Redis is unavailable. */
const memoryOnlyCache: SeoCacheClient = {
  async get() {
    return null;
  },
  async setex() {
    return undefined;
  },
  async del() {
    return undefined;
  },
};

export class SimulatorSeoService {
  private readonly cache: SeoCacheClient;
  private readonly fetchAssetIndexImpl: () => Promise<SimulatorAsset[]>;
  private readonly fetchSitemapXmlImpl: () => Promise<string>;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly memoryFallback = new Map<string, MemoryCacheEntry>();

  private hits = 0;
  private misses = 0;
  private fallbackReads = 0;
  private fallbackWrites = 0;

  constructor(dependencies: SeoServiceDependencies = {}) {
    const redis = redisClient.getClient();
    this.cache =
      dependencies.cache ??
      (redis
        ? ({
            get: (key: string) => redis.get(key),
            setex: (key: string, ttl: number, value: string) => redis.setex(key, ttl, value),
            del: (key: string) => redis.del(key),
          } as SeoCacheClient)
        : memoryOnlyCache);
    this.fetchAssetIndexImpl = dependencies.fetchAssetIndex ?? (async () => DEFAULT_ASSETS);
    this.fetchSitemapXmlImpl = dependencies.fetchSitemapXml ?? (async () => DEFAULT_SITEMAP_XML);
    this.now = dependencies.now ?? (() => Date.now());
    this.baseUrl = dependencies.baseUrl ?? 'https://web3studentlab.dev';
  }

  async getAssetIndex(): Promise<SimulatorAsset[]> {
    return this.getOrCache<SimulatorAsset[]>(
      ASSET_INDEX_CACHE_KEY,
      120,
      this.fetchAssetIndexImpl
    );
  }

  async getMetaTags(slug: string): Promise<SimulatorMetaTags | null> {
    const assets = await this.getAssetIndex();
    const found = assets.find((asset) => asset.slug === slug);
    if (!found) {
      return null;
    }

    return buildMetaTags(found, this.baseUrl);
  }

  async getSitemapUrls(): Promise<string[]> {
    const xml = await this.getOrCache<string>(
      SITEMAP_CACHE_KEY,
      180,
      this.fetchSitemapXmlImpl
    );

    return parseSitemapXml(xml);
  }

  getCacheStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      fallbackReads: this.fallbackReads,
      fallbackWrites: this.fallbackWrites,
    };
  }

  async clearCache(): Promise<void> {
    this.memoryFallback.clear();
    if (typeof this.cache.del === 'function') {
      await Promise.all([
        this.cache.del(ASSET_INDEX_CACHE_KEY),
        this.cache.del(SITEMAP_CACHE_KEY),
      ]).catch(() => undefined);
    }
  }

  private getFromMemoryFallback(key: string): string | null {
    const item = this.memoryFallback.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= this.now()) {
      this.memoryFallback.delete(key);
      return null;
    }

    this.fallbackReads += 1;
    return item.value;
  }

  private setMemoryFallback(key: string, value: string, ttlSeconds: number): void {
    this.fallbackWrites += 1;
    this.memoryFallback.set(key, {
      value,
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }

  private async getOrCache<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const fallbackValue = this.getFromMemoryFallback(key);
    if (fallbackValue) {
      this.hits += 1;
      return JSON.parse(fallbackValue) as T;
    }

    try {
      const cached = await this.cache.get(key);
      if (cached) {
        this.hits += 1;
        return JSON.parse(cached) as T;
      }
    } catch {
      const memory = this.getFromMemoryFallback(key);
      if (memory) {
        this.hits += 1;
        return JSON.parse(memory) as T;
      }
    }

    this.misses += 1;
    const fresh = await fetcher();
    const serialized = JSON.stringify(fresh);

    try {
      await this.cache.setex(key, ttlSeconds, serialized);
    } catch {
      this.setMemoryFallback(key, serialized, ttlSeconds);
    }

    return fresh;
  }
}

export const simulatorSeoService = new SimulatorSeoService();
