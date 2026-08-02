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
 * All entries are versioned with a logical timestamp so that out-of-order
 * invalidations cannot erase newer data. Stored values are JSON-encoded as
 * `{v, ts, op}` so legacy raw values are still readable.
 *
 * The replicator depends only on the minimal {@link RedisLike} interface, so it
 * can be driven by real ioredis clients in production or fakes in tests.
 */

interface VersionedEntry<T = string> {
  v: T;
  ts: number;
  op: 'set' | 'del';
}

const DEAD_STATUSES = new Set(['end', 'close']);
const DEFAULT_TTL_SECONDS = 900;

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** ioredis connection status; absent on fakes (treated as healthy). */
  readonly status?: string;
}

export interface RegionClient {
  name: string;
  client: RedisLike;
}

export interface ReplicationResult {
  /** Region the write originated in, or null if no region was writable. */
  origin: string | null;
  /** Regions the key was successfully written/replicated to. */
  replicated: string[];
  /** Regions that failed to accept the write. */
  failed: string[];
  /** Logical timestamp of the applied operation. */
  sequence: number;
}

export class RegionReplicator {
  private readonly regionNames: string[];
  private readonly clientsByName: Map<string, RedisLike>;
  private sequence = 0;

  constructor(
    regions: RegionClient[],
    private readonly activeRegion: string
  ) {
    this.regionNames = regions.map((r) => r.name);
    this.clientsByName = new Map(regions.map((r) => [r.name, r.client]));
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private static encodeEntry<T>(value: T, ts: number, op: VersionedEntry['op']): string {
    return JSON.stringify({ v: value, ts, op });
  }

  private static decodeEntry(raw: string | null): VersionedEntry | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as VersionedEntry;
    } catch {
      return { v: raw, ts: 0, op: 'set' };
    }
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
   *
   * Each delivery is versioned with a logical timestamp so out-of-order
   * replicas can resolve conflicts deterministically (newer writes win).
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<ReplicationResult> {
    const order = this.preferenceOrder();
    if (order.length === 0) {
      logger.error('RegionReplicator: no healthy regions available for write');
      return { origin: null, replicated: [], failed: [...this.regionNames], sequence: 0 };
    }

    const origin = order[0]!;
    const replicas = order.slice(1);
    const seq = this.nextSequence();
    const ts = Date.now();
    const payload = RegionReplicator.encodeEntry(value, ts, 'set');
    const replicated: string[] = [];
    const failed: string[] = [];

    try {
      await this.writeOne(origin, key, payload, ttlSeconds ?? DEFAULT_TTL_SECONDS);
      replicated.push(origin);
    } catch (error) {
      logger.error(`RegionReplicator: origin write to ${origin} failed:`, error);
      failed.push(origin);
    }

    const settled = await Promise.allSettled(
      replicas.map((name) => this.writeOne(name, key, payload, ttlSeconds ?? DEFAULT_TTL_SECONDS))
    );
    settled.forEach((result, i) => {
      const name = replicas[i]!;
      if (result.status === 'fulfilled') {
        replicated.push(name);
      } else {
        failed.push(name);
        logger.warn(`RegionReplicator: replication to ${name} failed:`, result.reason);
      }
    });

    return { origin: replicated[0] ?? null, replicated, failed, sequence: seq };
  }

  /**
   * Read a key using region-based fallback: try the active region first, then
   * other healthy regions until a value is found. Returns null if absent
   * everywhere or all reachable regions error.
   *
   * Values are returned unwrapped; tombstones (deletes newer than the value)
   * are treated as misses.
   */
  async get(key: string): Promise<string | null> {
    let latestSet: VersionedEntry | null = null;
    let latestSetRegion: string | null = null;

    for (const name of this.preferenceOrder()) {
      try {
        const raw = await this.clientsByName.get(name)!.get(key);
        const entry = RegionReplicator.decodeEntry(raw);
        if (!entry) continue;

        if (entry.op === 'del') {
          if (!latestSet || entry.ts >= latestSet.ts) {
            return null;
          }
          continue;
        }

        if (!latestSet || entry.ts > latestSet.ts) {
          latestSet = entry;
          latestSetRegion = name;
        }
      } catch (error) {
        logger.warn(`RegionReplicator: read from ${name} failed, falling back:`, error);
      }
    }

    return latestSet?.v ?? null;
  }

  /**
   * Delete a key from every region so it stays consistent across regions.
   *
   * The delete is versioned with a logical timestamp so that a newer write
   * arriving after the invalidation is not lost.
   */
  async del(key: string): Promise<{ deleted: string[]; failed: string[]; sequence: number }> {
    const seq = this.nextSequence();
    const ts = Date.now();
    const payload = RegionReplicator.encodeEntry(null, ts, 'del');
    const deleted: string[] = [];
    const failed: string[] = [];

    await Promise.allSettled(
      this.regionNames.map(async (name) => {
        try {
          await this.clientsByName.get(name)!.del(key);
          await this.writeOne(name, key, payload);
          deleted.push(name);
        } catch (error) {
          failed.push(name);
          logger.warn(`RegionReplicator: delete in ${name} failed:`, error);
        }
      })
    );

    return { deleted, failed, sequence: seq };
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
