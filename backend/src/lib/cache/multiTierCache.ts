import cacheService from '../../cache/CacheService.js';
import redisClient from '../../cache/RedisClient.js';

const CACHE_PREFIX = 'multi-tier:';
const INVALIDATION_CHANNEL = 'cache:invalidate:multi-tier';
const MAX_L1_ENTRIES = 5000;

interface CacheEnvelope<T> {
  value: T;
  freshUntil: number;
  staleUntil: number;
}

export interface MultiTierCacheOptions<T = unknown> {
  ttlSeconds: number;
  staleSeconds?: number;
  shouldCache?: (value: T) => boolean;
}

interface InvalidationMessage {
  key?: string;
  prefix?: string;
}

class MultiTierCache {
  private readonly l1 = new Map<string, CacheEnvelope<unknown>>();
  private readonly refreshes = new Map<string, Promise<void>>();
  private subscription: Promise<void> | null = null;
  private mutationEpoch = 0;

  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    options: MultiTierCacheOptions<T>
  ): Promise<T> {
    this.subscribeToInvalidations();

    const now = Date.now();
    const local = this.l1.get(key) as CacheEnvelope<T> | undefined;
    if (local) {
      if (local.freshUntil > now) {
        this.touch(key, local);
        return local.value;
      }
      if (local.staleUntil > now) {
        this.touch(key, local);
        this.refreshInBackground(key, loader, options);
        return local.value;
      }
      this.l1.delete(key);
    }

    const remote = await cacheService.get<CacheEnvelope<T>>(this.storageKey(key));
    if (remote && remote.staleUntil > now) {
      this.remember(key, remote);
      if (remote.freshUntil <= now) {
        this.refreshInBackground(key, loader, options);
      }
      return remote.value;
    }

    const filledLocally = this.l1.get(key) as CacheEnvelope<T> | undefined;
    if (filledLocally && filledLocally.staleUntil > Date.now()) return filledLocally.value;

    return this.loadOrJoin(key, loader, options);
  }

  async invalidate(key: string): Promise<void> {
    this.mutationEpoch++;
    this.l1.delete(key);
    await cacheService.del(this.storageKey(key));
    await this.broadcast({ key });
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    this.mutationEpoch++;
    for (const key of this.l1.keys()) {
      if (key.startsWith(prefix)) this.l1.delete(key);
    }
    await cacheService.delPattern(`${CACHE_PREFIX}${prefix}*`);
    await this.broadcast({ prefix });
  }

  clearLocal(): void {
    this.l1.clear();
    this.mutationEpoch++;
  }

  private async loadAndStore<T>(
    key: string,
    loader: () => Promise<T>,
    options: MultiTierCacheOptions<T>
  ): Promise<T> {
    const epoch = this.mutationEpoch;
    const value = await loader();
    if (epoch === this.mutationEpoch && (options.shouldCache?.(value) ?? true)) {
      await this.store(key, value, options);
    }
    return value;
  }

  private async loadOrJoin<T>(
    key: string,
    loader: () => Promise<T>,
    options: MultiTierCacheOptions<T>
  ): Promise<T> {
    const ongoing = this.refreshes.get(key);
    if (ongoing) {
      await ongoing;
      const refreshed = this.l1.get(key) as CacheEnvelope<T> | undefined;
      if (refreshed && refreshed.staleUntil > Date.now()) return refreshed.value;
    }

    const load = this.loadAndStore(key, loader, options);
    const tracked = load.then(() => undefined, () => undefined);
    this.refreshes.set(key, tracked);
    try {
      return await load;
    } finally {
      if (this.refreshes.get(key) === tracked) this.refreshes.delete(key);
    }
  }

  private refreshInBackground<T>(
    key: string,
    loader: () => Promise<T>,
    options: MultiTierCacheOptions<T>
  ): void {
    if (this.refreshes.has(key)) return;
    const epoch = this.mutationEpoch;
    const refresh = loader()
      .then(async (value) => {
        if (epoch === this.mutationEpoch && (options.shouldCache?.(value) ?? true)) {
          await this.store(key, value, options);
        }
      })
      .catch(() => undefined)
      .finally(() => this.refreshes.delete(key));
    this.refreshes.set(key, refresh);
  }

  private async store<T>(key: string, value: T, options: MultiTierCacheOptions<T>): Promise<void> {
    const now = Date.now();
    const envelope: CacheEnvelope<T> = {
      value,
      freshUntil: now + Math.max(0, options.ttlSeconds) * 1000,
      staleUntil: now + (Math.max(0, options.ttlSeconds) + Math.max(0, options.staleSeconds ?? 0)) * 1000,
    };
    this.remember(key, envelope);
    const ttl = Math.max(1, Math.ceil((envelope.staleUntil - now) / 1000));
    await cacheService.set(this.storageKey(key), envelope, ttl);
  }

  private remember<T>(key: string, envelope: CacheEnvelope<T>): void {
    this.l1.delete(key);
    this.l1.set(key, envelope);
    if (this.l1.size > MAX_L1_ENTRIES) {
      const oldest = this.l1.keys().next().value as string | undefined;
      if (oldest !== undefined) this.l1.delete(oldest);
    }
  }

  private touch<T>(key: string, envelope: CacheEnvelope<T>): void {
    this.remember(key, envelope);
  }

  private storageKey(key: string): string {
    return `${CACHE_PREFIX}${key}`;
  }

  private subscribeToInvalidations(): void {
    if (this.subscription) return;
    const subscriber = redisClient.getSubClient();
    if (!subscriber) return;

    this.subscription = subscriber
      .subscribe(INVALIDATION_CHANNEL)
      .then(() => {
        subscriber.on('message', (channel: string, raw: string) => {
          if (channel !== INVALIDATION_CHANNEL) return;
          try {
            const message = JSON.parse(raw) as InvalidationMessage;
            if (message.key) this.l1.delete(message.key);
            if (message.prefix) {
              for (const key of this.l1.keys()) {
                if (key.startsWith(message.prefix)) this.l1.delete(key);
              }
            }
            this.mutationEpoch++;
          } catch {
            // Ignore malformed invalidation messages; TTL remains the fallback.
          }
        });
      })
      .catch(() => {
        this.subscription = null;
      });
  }

  private async broadcast(message: InvalidationMessage): Promise<void> {
    const publisher = redisClient.getPubClient();
    if (!publisher) return;
    try {
      await publisher.publish(INVALIDATION_CHANNEL, JSON.stringify(message));
    } catch {
      // Local invalidation still succeeds if Redis pub/sub is unavailable.
    }
  }
}

export const multiTierCache = new MultiTierCache();
export default multiTierCache;
