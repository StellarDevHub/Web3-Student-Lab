import axios from 'axios';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CachedFetchOptions {
  ttlMs?: number;
  allowStaleOnRateLimit?: boolean;
}

class ApiRequestCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();

  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CachedFetchOptions = {}
  ): Promise<T> {
    const { ttlMs = 15_000, allowStaleOnRateLimit = true } = options;
    const now = Date.now();
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;

    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const inFlight = this.inFlight.get(key) as Promise<T> | undefined;
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      try {
        const data = await fetcher();
        this.cache.set(key, {
          data,
          expiresAt: Date.now() + ttlMs,
        });
        return data;
      } catch (error) {
        if (allowStaleOnRateLimit && cached && axios.isAxiosError(error)) {
          if (error.response?.status === 429) {
            return cached.data;
          }
        }

        throw error;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, request);
    return request;
  }

  invalidate(key: string) {
    this.cache.delete(key);
    this.inFlight.delete(key);
  }

  invalidatePrefix(prefix: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }

    for (const key of this.inFlight.keys()) {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key);
      }
    }
  }
}

export const apiRequestCache = new ApiRequestCache();
