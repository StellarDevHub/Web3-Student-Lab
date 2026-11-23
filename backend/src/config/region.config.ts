/**
 * Multi-region Redis replication configuration.
 *
 * Defines the set of Redis regions the cache replicates across and which region
 * the current process treats as "local" (active). Parsing and region-selection
 * here are **pure** so they can be unit-tested without any Redis connection.
 *
 * Environment:
 *   REDIS_REGIONS        comma-separated `name@connection` pairs, where
 *                        `connection` is a redis URL or `host:port`. e.g.
 *                        "us-east@redis://cache-us:6379,eu-west@cache-eu:6379"
 *   REDIS_ACTIVE_REGION  name of this process's local region (defaults to the
 *                        first configured region).
 */

/** A single replication region and how to connect to it. */
export interface RegionConfig {
  /** Logical region name, e.g. "us-east". */
  name: string;
  /** Redis URL or `host:port` connection string. */
  connection: string;
}

/**
 * Parse the `REDIS_REGIONS` env value into an ordered list of regions.
 * Malformed entries (missing name or connection) are skipped. Returns an empty
 * list when unset, so callers can detect "multi-region not configured".
 */
export function parseRegions(env: NodeJS.ProcessEnv = process.env): RegionConfig[] {
  const raw = env.REDIS_REGIONS?.trim();
  if (!raw) return [];

  const regions: RegionConfig[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // Split on the FIRST '@' only — connection strings may contain '@'
    // (e.g. redis://user:pass@host:6379).
    const at = trimmed.indexOf('@');
    if (at <= 0 || at === trimmed.length - 1) continue;

    const name = trimmed.slice(0, at).trim();
    const connection = trimmed.slice(at + 1).trim();
    if (!name || !connection || seen.has(name)) continue;

    seen.add(name);
    regions.push({ name, connection });
  }

  return regions;
}

/**
 * Determine the active (local) region name. Honours `REDIS_ACTIVE_REGION` when
 * it matches a configured region, otherwise falls back to the first region.
 * Returns undefined when no regions are configured.
 */
export function resolveActiveRegionName(
  regions: RegionConfig[],
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (regions.length === 0) return undefined;
  const requested = env.REDIS_ACTIVE_REGION?.trim();
  if (requested && regions.some((r) => r.name === requested)) {
    return requested;
  }
  // Length checked above, so the first element is guaranteed to exist.
  return regions[0]!.name;
}

/**
 * Order regions by connection preference for region-based fallback: the active
 * region first (when healthy), then any other healthy regions. Unhealthy regions
 * are excluded, so the result is the list of regions safe to talk to, best
 * first. Pure — health is supplied by the caller.
 */
export function orderRegionsByPreference(
  regionNames: string[],
  activeName: string,
  isHealthy: (name: string) => boolean
): string[] {
  const active = regionNames.filter((n) => n === activeName && isHealthy(n));
  const others = regionNames.filter((n) => n !== activeName && isHealthy(n));
  return [...active, ...others];
}
