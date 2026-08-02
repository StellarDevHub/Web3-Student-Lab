import axios from 'axios';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CachedFetchOptions {
  ttlMs?: number;
  allowStaleOnRateLimit?: boolean;
}

const PERSIST_PREFIX = 'web3-student-lab-api-cache:';

function persistCacheEntry<T>(key: string, entry: CacheEntry<T>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(`${PERSIST_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Ignore storage errors. Offline fallback should not break the app.
  }
}

function loadPersistedCacheEntry<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = localStorage.getItem(`${PERSIST_PREFIX}${key}`);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as CacheEntry<T>;
  } catch {
    return null;
  }
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
    const persisted = loadPersistedCacheEntry<T>(key);
    const isOffline = typeof window !== 'undefined' && !navigator.onLine;

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
        const entry: CacheEntry<T> = {
          data,
          expiresAt: Date.now() + ttlMs,
        };
        this.cache.set(key, entry);
        persistCacheEntry(key, entry);
        return data;
      } catch (error) {
        if (allowStaleOnRateLimit && cached && axios.isAxiosError(error)) {
          if (error.response?.status === 429) {
            return cached.data;
          }
        }

        if (isOffline && persisted) {
          return persisted.data;
        }

        if (persisted && persisted.expiresAt > now) {
          return persisted.data;
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`${PERSIST_PREFIX}${key}`);
    }
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

    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i += 1) {
        const storageKey = localStorage.key(i);
        if (storageKey?.startsWith(PERSIST_PREFIX + prefix)) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  }
}

export const apiRequestCache = new ApiRequestCache();
