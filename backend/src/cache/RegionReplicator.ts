import Redis from 'ioredis';
import logger from '../utils/logger.js';
import {
  orderRegionsByPreference,
  parseRegions,
  resolveActiveRegionName,
  type RegionConfig,
} from '../config/region.config.js';

/**
 * Multi-region cache replication.
 *
 * Implements a multi-master replication model at the application layer: a write
 * is applied to the active (local) region first for low latency, then fanned out
 * to every other healthy region so the same keys exist everywhere. Reads use
 * region-based fallback — the active region first, then other healthy regions —
 * so a single region outage degrades latency, not availability.
 *
 * The replicator depends only on the minimal {@link RedisLike} interface, so it
 * can be driven by real ioredis clients in production or fakes in tests.
 */

/** The minimal Redis surface the replicator needs. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** ioredis connection status; absent on fakes (treated as healthy). */
  readonly status?: string;
}

/** A named region paired with its client. */
export interface RegionClient {
  name: string;
  client: RedisLike;
}

/** Outcome of a replicated write. */
export interface ReplicationResult {
  /** Region the write originated in, or null if no region was writable. */
  origin: string | null;
  /** Regions the key was successfully written/replicated to. */
  replicated: string[];
  /** Regions that failed to accept the write. */
  failed: string[];
}

// ioredis statuses that mean the connection is unusable.
const DEAD_STATUSES = new Set(['end', 'close']);

export class RegionReplicator {
  private readonly regionNames: string[];
  private readonly clientsByName: Map<string, RedisLike>;

  constructor(
    regions: RegionClient[],
    private readonly activeRegion: string
  ) {
    this.regionNames = regions.map((r) => r.name);
    this.clientsByName = new Map(regions.map((r) => [r.name, r.client]));
  }

  /** A region is healthy unless its client reports a dead connection status. */
  private isHealthy = (name: string): boolean => {
    const client = this.clientsByName.get(name);
    if (!client) return false;
    return !DEAD_STATUSES.has(client.status ?? 'ready');
  };

  /** Healthy regions in fallback preference order (active first). */
  private preferenceOrder(): string[] {
    return orderRegionsByPreference(this.regionNames, this.activeRegion, this.isHealthy);
  }

  private async writeOne(name: string, key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.clientsByName.get(name);
    if (!client) throw new Error(`Unknown region: ${name}`);
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, value, 'EX', ttlSeconds);
    } else {
      await client.set(key, value);
    }
  }

  /**
   * Write a key to the active region and replicate it to every other healthy
   * region. Replication is best-effort and runs in parallel; a replica failure
   * is logged but does not fail the call (the origin write is what matters).
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<ReplicationResult> {
    const order = this.preferenceOrder();
    if (order.length === 0) {
      logger.error('RegionReplicator: no healthy regions available for write');
      return { origin: null, replicated: [], failed: [...this.regionNames] };
    }

    const [origin, ...replicas] = order;
    const replicated: string[] = [];
    const failed: string[] = [];

    if (origin !== undefined) {
      try {
        await this.writeOne(origin, key, value, ttlSeconds);
        replicated.push(origin);
      } catch (error) {
        logger.error(`RegionReplicator: origin write to ${origin} failed:`, error);
        failed.push(origin);
      }
    }

    const settled = await Promise.allSettled(
      replicas.map((name) => this.writeOne(name, key, value, ttlSeconds))
    );
    settled.forEach((result, i) => {
      const name = replicas[i];
      if (name === undefined) return;
      if (result.status === 'fulfilled') {
        replicated.push(name);
      } else {
        failed.push(name);
        logger.warn(`RegionReplicator: replication to ${name} failed:`, result.reason);
      }
    });

    return { origin: replicated[0] ?? null, replicated, failed };
  }

  /**
   * Read a key using region-based fallback: try the active region first, then
   * other healthy regions until a value is found. Returns null if absent
   * everywhere or all reachable regions error.
   */
  async get(key: string): Promise<string | null> {
    for (const name of this.preferenceOrder()) {
      try {
        const value = await this.clientsByName.get(name)!.get(key);
        if (value !== null && value !== undefined) return value;
      } catch (error) {
        logger.warn(`RegionReplicator: read from ${name} failed, falling back:`, error);
      }
    }
    return null;
  }

  /** Delete a key from every region so it stays consistent across regions. */
  async del(key: string): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];
    await Promise.allSettled(
      this.regionNames.map(async (name) => {
        try {
          await this.clientsByName.get(name)!.del(key);
          deleted.push(name);
        } catch (error) {
          failed.push(name);
          logger.warn(`RegionReplicator: delete in ${name} failed:`, error);
        }
      })
    );
    return { deleted, failed };
  }

  getActiveRegion(): string {
    return this.activeRegion;
  }

  getRegions(): string[] {
    return [...this.regionNames];
  }
}

/** Create an ioredis client from a URL or `host:port` connection string. */
function createIoRedisClient(connection: string): RedisLike {
  const options = { maxRetriesPerRequest: 3, enableOfflineQueue: false };
  if (connection.includes('://')) {
    return new Redis(connection, options) as unknown as RedisLike;
  }
  const [host, port] = connection.split(':');
  return new Redis({ host, port: parseInt(port || '6379', 10), ...options }) as unknown as RedisLike;
}

/** Build region clients from parsed config (opens real connections). */
export function buildRegionClients(regions: RegionConfig[]): RegionClient[] {
  return regions.map((region) => ({
    name: region.name,
    client: createIoRedisClient(region.connection),
  }));
}

/**
 * Build a {@link RegionReplicator} from the environment, or return null when
 * multi-region replication is not configured (no `REDIS_REGIONS`). Call this
 * once at startup — it opens connections, so it has no effect at import time.
 */
export function createRegionReplicator(
  env: NodeJS.ProcessEnv = process.env
): RegionReplicator | null {
  const regions = parseRegions(env);
  if (regions.length === 0) return null;

  const activeRegion = resolveActiveRegionName(regions, env);
  if (!activeRegion) return null;

  logger.info(
    `RegionReplicator: ${regions.length} region(s) configured, active=${activeRegion}`
  );
  return new RegionReplicator(buildRegionClients(regions), activeRegion);
}
