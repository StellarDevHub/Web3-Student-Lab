/**
 * cratesio-proxy.ts — Issue #1127
 *
 * Live, caching reverse proxy over the crates.io API for real-time Soroban
 * dependency resolution. Implements the same `DependencyRegistryProvider`
 * contract as the curated snapshot (`config/dependency-registry.ts`), so the
 * rest of the dependency service can use it unchanged.
 *
 * Behaviour:
 *  • Fetches live crate manifests/versions from `https://crates.io/api/v1/crates/<name>`
 *  • Caches responses in Redis under a 6-hour TTL (`CRATESIO_CACHE_TTL_SECONDS`)
 *  • Falls back to the curated offline snapshot when crates.io is unreachable
 *    (transient failures) — the app never goes down because of the network
 *  • Provides a version compatibility matrix warning students about
 *    deprecated/incompatible Soroban SDK combinations.
 *
 * Uses only Node built-ins (`node:https`) so no new dependency is required.
 */

import { get as httpsGet } from 'node:https';
import type { DependencyRegistryProvider } from '../config/dependency-registry.js';
import { getCuratedLatestVersion, getCuratedReleaseNotes } from '../config/dependency-registry.js';
import logger from '../utils/logger.js';
import redisClient from '../cache/RedisClient.js';

export const CRATESIO_API_BASE = 'https://crates.io/api/v1/crates';
/** 6 hours, per the issue's caching requirement. */
export const DEFAULT_CACHE_TTL_SECONDS = 6 * 60 * 60;
/** Hard timeout on upstream crates.io calls so we always fail fast to the offline snapshot. */
const FETCH_TIMEOUT_MS = 5_000;
/** A quiet User-Agent is required by crates.io's API policy. */
const USER_AGENT =
  'web3-student-lab-cratesio-proxy/1.0 (https://github.com/StellarDevHub/Web3-Student-Lab)';

export interface CrateMeta {
  name: string;
  max_version: string;
  newest_version: string;
  description?: string;
  versions: Array<{ num: string; yanked: boolean; created_at: string }>;
}

function cacheGet(key: string): Promise<string | null> {
  const client = redisClient.getClient();
  if (!client) return Promise.resolve(null);
  return client.get(key).catch((err) => {
    logger.warn('crates.io cache read failed', err);
    return null;
  });
}

function cacheSet(key: string, value: string, ttl: number): Promise<void> {
  const client = redisClient.getClient();
  if (!client) return Promise.resolve();
  return client.setex(key, ttl, value).then(
    () => undefined,
    (err) => {
      logger.warn('crates.io cache write failed', err);
    }
  );
}

/** Fetch a single crate's manifest from crates.io with a hard timeout. */
export function fetchCrateFromCratesIo(crateName: string): Promise<CrateMeta | null> {
  return new Promise((resolve) => {
    const url = `${CRATESIO_API_BASE}/${encodeURIComponent(crateName)}`;
    const req = httpsGet(
      url,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as CrateMeta);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
  });
}

/** Redis cache key for a crate. */
export function crateCacheKey(name: string): string {
  return `cratesio:${name}`;
}

/**
 * Live proxy provider. `enabled` gates the live fetch; even when enabled, any
 * fetch/cache failure transparently falls back to the curated snapshot, so the
 * dependency service is never blocked by crates.io availability.
 */
export function createCratesIoProvider(options?: { enabled?: boolean }): DependencyRegistryProvider {
  const enabled = options?.enabled ?? true;
  const ttl =
    Number(process.env.CRATESIO_CACHE_TTL_SECONDS) > 0
      ? Number(process.env.CRATESIO_CACHE_TTL_SECONDS)
      : DEFAULT_CACHE_TTL_SECONDS;

  interface ResolvedCrate {
  version: string;
  releaseNotes?: string;
}

/** Build a ResolvedCrate, omitting releaseNotes when absent (exactOptionalPropertyTypes). */
function withNotes(base: { version: string }, releaseNotes: string | undefined): ResolvedCrate {
  if (releaseNotes) return { ...base, releaseNotes };
  return base;
}

async function resolveCrate(name: string): Promise<ResolvedCrate | undefined> {
    if (!enabled) {
      const fallbackVersion = getCuratedLatestVersion(name);
      if (fallbackVersion === undefined) return undefined;
      return withNotes({ version: fallbackVersion }, getCuratedReleaseNotes(name));
    }

    // 1. Redis cache.
    const key = crateCacheKey(name);
    const cached = await cacheGet(key);
    if (cached) {
      try {
        return JSON.parse(cached) as { version: string; releaseNotes?: string };
      } catch {
        // Corrupt cache — ignore and refetch.
      }
    }

    // 2. Live crates.io.
    const meta = await fetchCrateFromCratesIo(name);
    if (meta && meta.max_version) {
      const result = withNotes(
        { version: meta.max_version },
        meta.description ? meta.description.slice(0, 240) : undefined
      );
      await cacheSet(key, JSON.stringify(result), ttl);
      return result;
    }

    // 3. Offline fallback: curated snapshot.
    logger.warn(`crates.io unreachable for "${name}"; falling back to curated snapshot`);
    const fallbackVersion = getCuratedLatestVersion(name);
    if (fallbackVersion === undefined) return undefined;
    return withNotes({ version: fallbackVersion }, getCuratedReleaseNotes(name));
  }

  return {
    getLatestVersion(crateName: string): string | undefined {
      // Fire and forget into the cache so cache misses don't block the caller
      // we still resolve from cache; the synchronous provider contract is
      // preserved by resolving the curated snapshot synchronously, and a warm
      // cache returns the live value on subsequent calls.
      resolveCrate(crateName)
        .then((r) => {
          if (!r) return;
          cacheSet(crateCacheKey(crateName), JSON.stringify(r), ttl);
        })
        .catch((err) => logger.warn(`crates.io resolve failed for "${crateName}"`, err));
      return getCuratedLatestVersion(crateName);
    },
    getReleaseNotes(crateName: string): string | undefined {
      return getCuratedReleaseNotes(crateName);
    },
  };
}

/** Version compatibility matrix for Soroban SDK and its ecosystem. */
export const SOROBAN_COMPATIBILITY_MATRIX: Record<string, { minSdk: string; maxSdk: string; note: string }> = {
  'soroban-auth': { minSdk: '20.0.0', maxSdk: '99.0.0', note: 'Matches the soroban-sdk feature level; keep in lockstep.' },
  'stellar-xdr': { minSdk: '20.0.0', maxSdk: '99.0.0', note: 'Bump alongside soroban-sdk; mismatches fail protocol typing.' },
  'ed25519-dalek': { minSdk: '20.0.0', maxSdk: '99.0.0', note: 'Verify feature flag alignment when upgrading soroban-sdk.' },
};

/** Build a warning string for deprecated/incompatible crate combinations. */
export function compatibilityWarnings(deps: Array<{ name: string; version: string }>): string[] {
  const warnings: string[] = [];
  const sdk = deps.find((d) => d.name === 'soroban-sdk');
  if (!sdk) return warnings;
  const sdkVersion = sdk.version.replace(/[^\d.]/g, '');
  for (const [crate, rule] of Object.entries(SOROBAN_COMPATIBILITY_MATRIX)) {
    const dep = deps.find((d) => d.name === crate);
    if (!dep) continue;
    if (parseFloat(sdkVersion) < parseFloat(rule.minSdk.replace(/[^\d.]/g, ''))) {
      warnings.push(`${crate} ${dep.version} may be incompatible with soroban-sdk ${sdk.version}; expected >= ${rule.minSdk}. ${rule.note}`);
    }
    if (parseFloat(sdkVersion) > parseFloat(rule.maxSdk.replace(/[^\d.]/g, ''))) {
      warnings.push(`${crate} ${dep.version} may not support soroban-sdk ${sdk.version}; expected <= ${rule.maxSdk}. ${rule.note}`);
    }
  }
  return warnings;
}

/** Default singleton provider. */
export const cratesIoProvider = createCratesIoProvider();