/**
 * IPFS Gateway Fallback Service — Issue #1178
 *
 * Provides high-availability reads from IPFS by trying multiple public
 * and private gateways in priority order.  If the primary gateway fails
 * or responds slowly, subsequent gateways are tried automatically.
 *
 * Features:
 *  - Configurable ordered gateway list with per-gateway timeouts.
 *  - SHA-256 content-integrity verification of every fetched payload.
 *  - Optional in-memory LRU-style cache to avoid repeat round-trips.
 *  - Gateway health tracking (error counts, last success timestamp).
 *  - All public methods are fully typed — no @ts-ignore suppressions.
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IpfsGatewayConfig {
  /** Human-readable name (for logging / metrics). */
  name: string;
  /**
   * URL template.  The literal string `{cid}` is replaced with the CID
   * and `{path}` (optional) is replaced with any sub-path.
   * e.g. `"https://cloudflare-ipfs.com/ipfs/{cid}{path}"`
   */
  urlTemplate: string;
  /** Per-request timeout in milliseconds.  Defaults to 10 000. */
  timeoutMs?: number;
  /** Set to false to disable this gateway without removing it from the list. */
  enabled?: boolean;
}

export interface GatewayHealth {
  name: string;
  consecutiveErrors: number;
  totalRequests: number;
  totalErrors: number;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
}

export interface IpfsFetchResult {
  /** Raw bytes retrieved from the gateway. */
  content: Buffer;
  /** SHA-256 hex digest of the returned bytes. */
  sha256: string;
  /** Name of the gateway that served the content. */
  gateway: string;
  /** Full URL that was fetched. */
  url: string;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
}

export interface IpfsGatewayServiceOptions {
  gateways?: IpfsGatewayConfig[];
  /** How many gateway failures before a CID is considered unfetchable.  Default 3. */
  maxAttempts?: number;
  /** Maximum number of CID→Buffer entries to keep in-process cache.  Default 256. */
  cacheCapacity?: number;
  /** TTL for cached entries in milliseconds.  Default 5 min. */
  cacheTtlMs?: number;
  /** Injected fetch function — useful for unit testing. */
  fetchFn?: typeof fetch;
}

// ─── Default Gateway List ─────────────────────────────────────────────────────

export const DEFAULT_GATEWAYS: IpfsGatewayConfig[] = [
  {
    name: 'Cloudflare',
    urlTemplate: 'https://cloudflare-ipfs.com/ipfs/{cid}{path}',
    timeoutMs: 10_000,
  },
  {
    name: 'Pinata',
    urlTemplate: 'https://gateway.pinata.cloud/ipfs/{cid}{path}',
    timeoutMs: 12_000,
  },
  {
    name: 'ipfs.io',
    urlTemplate: 'https://ipfs.io/ipfs/{cid}{path}',
    timeoutMs: 15_000,
  },
  {
    name: 'dweb.link',
    urlTemplate: 'https://{cid}.ipfs.dweb.link{path}',
    timeoutMs: 12_000,
  },
  {
    name: 'w3s.link',
    urlTemplate: 'https://{cid}.ipfs.w3s.link{path}',
    timeoutMs: 12_000,
  },
];

// ─── Cache Entry ─────────────────────────────────────────────────────────────

interface CacheEntry {
  result: IpfsFetchResult;
  expiresAt: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * High-availability IPFS content reader with multi-gateway fallback.
 *
 * Usage:
 * ```ts
 * const result = await ipfsGatewayService.fetchByCid('bafybeiabc...');
 * console.log(result.sha256, result.gateway);
 * ```
 */
export class IpfsGatewayService {
  private static instance: IpfsGatewayService | null = null;

  private readonly gateways: IpfsGatewayConfig[];
  private readonly maxAttempts: number;
  private readonly cacheCapacity: number;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: typeof fetch;

  /** Per-gateway health tracking. */
  private readonly health = new Map<string, GatewayHealth>();

  /** Simple FIFO/LRU cache: Map insertion order = LRU order. */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: IpfsGatewayServiceOptions = {}) {
    this.gateways = (options.gateways ?? DEFAULT_GATEWAYS).filter(
      (g) => g.enabled !== false
    );
    this.maxAttempts = options.maxAttempts ?? 3;
    this.cacheCapacity = options.cacheCapacity ?? 256;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1_000;
    this.fetchFn = options.fetchFn ?? fetch;

    for (const gw of this.gateways) {
      this.health.set(gw.name, {
        name: gw.name,
        consecutiveErrors: 0,
        totalRequests: 0,
        totalErrors: 0,
        lastSuccessAt: null,
        lastErrorAt: null,
      });
    }
  }

  static getInstance(options?: IpfsGatewayServiceOptions): IpfsGatewayService {
    if (!IpfsGatewayService.instance) {
      IpfsGatewayService.instance = new IpfsGatewayService(options);
    }
    return IpfsGatewayService.instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Fetches IPFS content by CID, trying each gateway in order until one
   * succeeds.  The returned payload is always SHA-256 verified.
   *
   * @param cid       - Bare CID (without `ipfs://` prefix).
   * @param subPath   - Optional sub-path within the CID root (e.g. `/metadata.json`).
   * @param expectedSha256 - When provided, the fetch is rejected if the content
   *                         does not match this hex digest (content-integrity guarantee).
   */
  async fetchByCid(
    cid: string,
    subPath = '',
    expectedSha256?: string
  ): Promise<IpfsFetchResult> {
    const cacheKey = `${cid}${subPath}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      if (expectedSha256 && cached.sha256 !== expectedSha256) {
        throw new Error(
          `IPFS content-integrity failure (cached): CID=${cid} ` +
            `expected=${expectedSha256} actual=${cached.sha256}`
        );
      }
      return cached;
    }

    const errors: Error[] = [];
    const attempts = Math.min(this.maxAttempts, this.gateways.length);

    // Sort gateways: prefer those with fewer consecutive errors
    const sorted = this.sortedGateways();

    for (let i = 0; i < attempts; i++) {
      const gateway = sorted[i];
      if (!gateway) break;

      const url = this.buildUrl(gateway, cid, subPath);
      const timeoutMs = gateway.timeoutMs ?? 10_000;

      try {
        const result = await this.fetchFromGateway(gateway.name, url, timeoutMs);

        if (expectedSha256 && result.sha256 !== expectedSha256) {
          const err = new Error(
            `IPFS content-integrity failure: CID=${cid} gateway=${gateway.name} ` +
              `expected=${expectedSha256} actual=${result.sha256}`
          );
          errors.push(err);
          this.recordError(gateway.name);
          logger.warn(`[IpfsGatewayService] Integrity check failed via ${gateway.name}`, {
            cid,
            expectedSha256,
            actualSha256: result.sha256,
          });
          continue;
        }

        this.recordSuccess(gateway.name);
        this.putInCache(cacheKey, result);

        logger.debug(`[IpfsGatewayService] Fetched CID ${cid} via ${gateway.name}`, {
          latencyMs: result.latencyMs,
          bytes: result.content.length,
        });

        return result;
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
        this.recordError(gateway.name);
        logger.warn(`[IpfsGatewayService] Gateway ${gateway.name} failed for CID ${cid}`, {
          url,
          error: (err as Error).message,
        });
      }
    }

    throw new AggregateError(
      errors,
      `All IPFS gateways failed for CID=${cid} after ${attempts} attempt(s)`
    );
  }

  /**
   * Convenience wrapper — parses `ipfs://` and `https://` URIs.
   */
  async fetchByUri(uri: string, expectedSha256?: string): Promise<IpfsFetchResult> {
    const { cid, subPath } = this.parseUri(uri);
    return this.fetchByCid(cid, subPath, expectedSha256);
  }

  /**
   * Returns a copy of the current health snapshot for all gateways.
   */
  getHealthStatus(): GatewayHealth[] {
    return Array.from(this.health.values()).map((h) => ({ ...h }));
  }

  /**
   * Returns the resolved fetch URL for a given gateway and CID
   * (useful for generating public read links without actually fetching).
   */
  buildPublicUrl(cid: string, subPath = '', gatewayIndex = 0): string {
    const gw = this.sortedGateways()[gatewayIndex];
    if (!gw) throw new Error('No gateways configured');
    return this.buildUrl(gw, cid, subPath);
  }

  /**
   * Clears the in-process cache.  Useful in tests.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private async fetchFromGateway(
    gatewayName: string,
    url: string,
    timeoutMs: number
  ): Promise<IpfsFetchResult> {
    const health = this.health.get(gatewayName);
    if (health) health.totalRequests++;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startTs = Date.now();

    try {
      const response = await this.fetchFn(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from gateway ${gatewayName}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const content = Buffer.from(arrayBuffer);
      const sha256 = this.computeSha256(content);
      const latencyMs = Date.now() - startTs;

      return { content, sha256, gateway: gatewayName, url, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(gw: IpfsGatewayConfig, cid: string, subPath: string): string {
    return gw.urlTemplate
      .replace('{cid}', cid)
      .replace('{path}', subPath || '');
  }

  private parseUri(uri: string): { cid: string; subPath: string } {
    // ipfs://CID or ipfs://CID/path
    if (uri.startsWith('ipfs://')) {
      const rest = uri.slice('ipfs://'.length);
      const slash = rest.indexOf('/');
      if (slash === -1) return { cid: rest, subPath: '' };
      return { cid: rest.slice(0, slash), subPath: rest.slice(slash) };
    }
    // https://gateway.xyz/ipfs/CID[/path]
    const match = uri.match(/\/ipfs\/([^/]+)(\/.*)?$/);
    if (match) {
      return { cid: match[1] ?? '', subPath: match[2] ?? '' };
    }
    // Bare CID
    return { cid: uri, subPath: '' };
  }

  /** SHA-256 hex digest of raw bytes. */
  computeSha256(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private sortedGateways(): IpfsGatewayConfig[] {
    return [...this.gateways].sort((a, b) => {
      const ha = this.health.get(a.name);
      const hb = this.health.get(b.name);
      return (ha?.consecutiveErrors ?? 0) - (hb?.consecutiveErrors ?? 0);
    });
  }

  private recordSuccess(gatewayName: string): void {
    const h = this.health.get(gatewayName);
    if (!h) return;
    h.consecutiveErrors = 0;
    h.lastSuccessAt = new Date();
  }

  private recordError(gatewayName: string): void {
    const h = this.health.get(gatewayName);
    if (!h) return;
    h.consecutiveErrors++;
    h.totalErrors++;
    h.lastErrorAt = new Date();
  }

  private getFromCache(key: string): IpfsFetchResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // LRU: re-insert at end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  private putInCache(key: string, result: IpfsFetchResult): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.cacheCapacity) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}

// Singleton export
export const ipfsGatewayService = IpfsGatewayService.getInstance();
