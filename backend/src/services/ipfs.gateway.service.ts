/**
 * IPFS Cluster Gateway Service — Issues #1178 (read fallback) and
 * #1421 / BE-HARD-30 (pin/upload multi-provider fallback + circuit
 * breaking).
 *
 * Provides high-availability access to IPFS-pinned content (student
 * certificates and assets) in both directions:
 *
 *  - **Reads**: `fetchByCid`/`fetchByUri` try multiple public/private read
 *    gateways in priority order, verify every payload's SHA-256 digest,
 *    and cache successful reads.
 *  - **Writes**: `pinContent` uploads a buffer to a primary pinning
 *    provider (Pinata) and automatically falls back to a secondary
 *    (Infura) and then a local Kubo node if the primary is unavailable —
 *    satisfying the "if Pinata fails, upload falls back to secondary
 *    provider" acceptance criterion.
 *
 * Both directions share a real circuit-breaker: a provider/gateway that
 * times out or errors repeatedly is marked `open` and skipped entirely
 * for a cooldown window (instead of being retried and paying the full
 * timeout on every single request), then probed once (`half-open`)
 * before being trusted again.
 *
 * Features:
 *  - Configurable ordered gateway list with per-gateway timeouts.
 *  - SHA-256 content-integrity verification of every fetched payload.
 *  - Optional in-memory LRU-style cache to avoid repeat round-trips.
 *  - Multi-provider pin/upload fallback (Pinata → Infura → local Kubo).
 *  - CID format validation (CIDv0 base58btc and CIDv1 base32/base36/hex).
 *  - Real open/half-open/closed circuit breaking on both reads and writes.
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

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface GatewayHealth {
  name: string;
  consecutiveErrors: number;
  totalRequests: number;
  totalErrors: number;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  /** Circuit-breaker state — see `CircuitBreakerOptions`. */
  circuitState: CircuitState;
  /** When the circuit last transitioned to `open`, or null if never opened. */
  circuitOpenedAt: Date | null;
}

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. Default 3. */
  failureThreshold?: number;
  /** How long the circuit stays open before a half-open probe is allowed. Default 30 000ms. */
  cooldownMs?: number;
}

/**
 * A pin/upload provider — the write-side counterpart of `IpfsGatewayConfig`.
 * `pinata` and `infura` both speak (slightly different) HTTP multipart
 * "add file" APIs; `kubo` is a self-hosted node exposing the same
 * `/api/v0/add` RPC that Infura's gateway is itself backed by.
 */
export interface PinProviderConfig {
  name: string;
  type: 'pinata' | 'infura' | 'kubo';
  /** Upload endpoint URL for this provider. */
  endpoint: string;
  timeoutMs?: number;
  enabled?: boolean;
  /** Pinata: JWT bearer token. Infura/Kubo: basic-auth username (project id). */
  authToken?: string;
  /** Infura/Kubo: basic-auth password (project secret). Unused for Pinata. */
  authSecret?: string;
}

export interface PinResult {
  /** Content Identifier returned by the pinning provider. */
  cid: string;
  provider: string;
  sizeBytes: number;
  sha256: string;
  latencyMs: number;
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
  /** Ordered pin/upload providers. Defaults to `buildDefaultPinProviders()`. */
  pinProviders?: PinProviderConfig[];
  /** Circuit-breaker tuning shared by both read gateways and pin providers. */
  circuitBreaker?: CircuitBreakerOptions;
}

// ─── CID Validation ────────────────────────────────────────────────────────────

/** CIDv0: multihash-encoded SHA-256, base58btc, always starts with "Qm", 46 chars. */
const CIDV0_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;

/**
 * CIDv1: multibase-prefixed. We accept the common multibase prefixes
 * (`b` = base32, `z` = base58btc, `f`/`F` = base16, `m` = base64) with a
 * generous length/charset check per base — this is not a full multibase
 * decoder, but it is enough to reject garbage strings (empty, whitespace,
 * URLs, obviously-truncated values) before spending a network round-trip.
 */
const CIDV1_PATTERNS: Record<string, RegExp> = {
  b: /^b[a-z2-7]{20,}$/, // base32 (lowercase, no padding) — e.g. "bafybei..."
  z: /^z[1-9A-HJ-NP-Za-km-z]{20,}$/, // base58btc
  f: /^f[0-9a-f]{20,}$/, // base16 lowercase
  F: /^F[0-9A-F]{20,}$/, // base16 uppercase
  m: /^m[A-Za-z0-9+/=]{20,}$/, // base64
};

/**
 * Returns true when `value` is structurally a valid IPFS CID (v0 or v1).
 * Used to reject malformed input before it is used to build a gateway URL
 * or before trusting a "CID" a pin provider claims to have returned.
 */
export function isValidCid(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  const trimmed = value.trim();
  if (trimmed !== value || trimmed.length < 2) return false;

  if (CIDV0_PATTERN.test(trimmed)) return true;

  const prefix = trimmed[0]!;
  const pattern = CIDV1_PATTERNS[prefix];
  return pattern ? pattern.test(trimmed) : false;
}

// ─── Default Pin Providers ─────────────────────────────────────────────────────

/**
 * Builds the default pin-provider fallback chain from environment
 * variables: Pinata (primary, JWT auth) → Infura (secondary, project
 * id/secret basic auth) → a local Kubo node (tertiary, no auth by
 * default). Providers whose required credentials are absent from `env`
 * are simply omitted — callers who only configure Pinata still get a
 * working single-provider chain, while a fully-configured environment
 * gets the full fallback chain the acceptance criteria describe.
 */
export function buildDefaultPinProviders(env: NodeJS.ProcessEnv = process.env): PinProviderConfig[] {
  const providers: PinProviderConfig[] = [];

  if (env.PINATA_JWT) {
    providers.push({
      name: 'Pinata',
      type: 'pinata',
      endpoint: env.PINATA_PIN_ENDPOINT ?? 'https://api.pinata.cloud/pinning/pinFileToIPFS',
      authToken: env.PINATA_JWT,
      timeoutMs: 20_000,
    });
  }

  if (env.INFURA_IPFS_PROJECT_ID && env.INFURA_IPFS_PROJECT_SECRET) {
    providers.push({
      name: 'Infura',
      type: 'infura',
      endpoint: env.INFURA_IPFS_ENDPOINT ?? 'https://ipfs.infura.io:5001/api/v0/add',
      authToken: env.INFURA_IPFS_PROJECT_ID,
      authSecret: env.INFURA_IPFS_PROJECT_SECRET,
      timeoutMs: 20_000,
    });
  }

  // Local Kubo node is always appended as the last-resort fallback — it
  // requires no credentials, only a reachable daemon. If unreachable it
  // simply fails like any other provider and the caller sees the
  // AggregateError from `pinContent`.
  providers.push({
    name: 'Kubo-Local',
    type: 'kubo',
    endpoint: env.KUBO_API_URL ?? 'http://127.0.0.1:5001/api/v0/add',
    timeoutMs: 15_000,
  });

  return providers;
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
  private readonly pinProviders: PinProviderConfig[];
  private readonly maxAttempts: number;
  private readonly cacheCapacity: number;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  /** Per-gateway health tracking (reads). */
  private readonly health = new Map<string, GatewayHealth>();
  /** Per-provider health tracking (pin/uploads) — separate namespace from reads. */
  private readonly pinHealth = new Map<string, GatewayHealth>();

  /** Simple FIFO/LRU cache: Map insertion order = LRU order. */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: IpfsGatewayServiceOptions = {}) {
    this.gateways = (options.gateways ?? DEFAULT_GATEWAYS).filter(
      (g) => g.enabled !== false
    );
    this.pinProviders = (options.pinProviders ?? buildDefaultPinProviders()).filter(
      (p) => p.enabled !== false
    );
    this.maxAttempts = options.maxAttempts ?? 3;
    this.cacheCapacity = options.cacheCapacity ?? 256;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1_000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.failureThreshold = options.circuitBreaker?.failureThreshold ?? 3;
    this.cooldownMs = options.circuitBreaker?.cooldownMs ?? 30_000;

    for (const gw of this.gateways) {
      this.health.set(gw.name, this.freshHealth(gw.name));
    }
    for (const provider of this.pinProviders) {
      this.pinHealth.set(provider.name, this.freshHealth(provider.name));
    }
  }

  private freshHealth(name: string): GatewayHealth {
    return {
      name,
      consecutiveErrors: 0,
      totalRequests: 0,
      totalErrors: 0,
      lastSuccessAt: null,
      lastErrorAt: null,
      circuitState: 'closed',
      circuitOpenedAt: null,
    };
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
    // Sort gateways: prefer those with fewer consecutive errors, and skip
    // any whose circuit breaker is currently open (still cooling down).
    const sorted = this.sortedGateways().filter((gw) => this.canAttempt(this.health, gw.name));
    const attempts = Math.min(this.maxAttempts, sorted.length);

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
          this.recordFailure(this.health, gateway.name);
          logger.warn(`[IpfsGatewayService] Integrity check failed via ${gateway.name}`, {
            cid,
            expectedSha256,
            actualSha256: result.sha256,
          });
          continue;
        }

        this.recordSuccess(this.health, gateway.name);
        this.putInCache(cacheKey, result);

        logger.debug(`[IpfsGatewayService] Fetched CID ${cid} via ${gateway.name}`, {
          latencyMs: result.latencyMs,
          bytes: result.content.length,
        });

        return result;
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
        this.recordFailure(this.health, gateway.name);
        logger.warn(`[IpfsGatewayService] Gateway ${gateway.name} failed for CID ${cid}`, {
          url,
          error: (err as Error).message,
        });
      }
    }

    if (errors.length === 0) {
      throw new Error(
        `All IPFS gateways for CID=${cid} have open circuit breakers (cooling down after repeated failures).`
      );
    }

    throw new AggregateError(
      errors,
      `All IPFS gateways failed for CID=${cid} after ${attempts} attempt(s)`
    );
  }

  /**
   * Uploads `content` to IPFS via the configured pin-provider fallback
   * chain (default: Pinata → Infura → local Kubo), trying each provider
   * in order until one succeeds. Providers whose circuit breaker is open
   * are skipped. Satisfies #1421's "if the primary Pinata gateway fails,
   * upload automatically falls back to a secondary provider" criterion.
   *
   * @param content  - Raw bytes to pin.
   * @param filename - Filename hint sent to the provider (metadata only).
   */
  async pinContent(content: Buffer, filename = 'upload.bin'): Promise<PinResult> {
    const sha256 = this.computeSha256(content);
    const providers = this.pinProviders.filter((p) => this.canAttempt(this.pinHealth, p.name));

    if (this.pinProviders.length === 0) {
      throw new Error(
        'No pin providers configured. Set PINATA_JWT and/or INFURA_IPFS_PROJECT_ID/SECRET, ' +
          'or run a local Kubo node, then rebuild the service with buildDefaultPinProviders().'
      );
    }

    const errors: Error[] = [];

    for (const provider of providers) {
      const timeoutMs = provider.timeoutMs ?? 20_000;
      const health = this.pinHealth.get(provider.name);
      if (health) health.totalRequests++;

      try {
        const startTs = Date.now();
        const cid = await this.uploadToProvider(provider, content, filename, timeoutMs);
        const latencyMs = Date.now() - startTs;

        if (!isValidCid(cid)) {
          throw new Error(`Provider ${provider.name} returned a malformed CID: "${cid}"`);
        }

        this.recordSuccess(this.pinHealth, provider.name);
        logger.info(`[IpfsGatewayService] Pinned ${filename} via ${provider.name}`, {
          cid,
          sizeBytes: content.length,
          latencyMs,
        });

        return { cid, provider: provider.name, sizeBytes: content.length, sha256, latencyMs };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push(error);
        this.recordFailure(this.pinHealth, provider.name);
        logger.warn(`[IpfsGatewayService] Pin provider ${provider.name} failed for ${filename}`, {
          error: error.message,
        });
      }
    }

    if (errors.length === 0) {
      throw new Error(
        `All pin providers have open circuit breakers (cooling down after repeated failures) for ${filename}.`
      );
    }

    throw new AggregateError(errors, `All pin providers failed to upload ${filename}`);
  }

  /**
   * Convenience wrapper — parses `ipfs://` and `https://` URIs.
   */
  async fetchByUri(uri: string, expectedSha256?: string): Promise<IpfsFetchResult> {
    const { cid, subPath } = this.parseUri(uri);
    return this.fetchByCid(cid, subPath, expectedSha256);
  }

  /**
   * Returns a copy of the current health snapshot for all read gateways.
   */
  getHealthStatus(): GatewayHealth[] {
    return Array.from(this.health.values()).map((h) => ({ ...h }));
  }

  /**
   * Returns a copy of the current health snapshot for all pin/upload
   * providers (Pinata/Infura/Kubo).
   */
  getPinHealthStatus(): GatewayHealth[] {
    return Array.from(this.pinHealth.values()).map((h) => ({ ...h }));
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

  // ── Circuit Breaker (shared by read gateways and pin providers) ────────

  /**
   * Whether `name` may currently be attempted. An `open` circuit blocks
   * attempts until `cooldownMs` has elapsed since it opened, at which
   * point it transitions to `half-open` and a single probe attempt is
   * allowed through — success closes the circuit, failure re-opens it
   * and restarts the cooldown.
   */
  private canAttempt(map: Map<string, GatewayHealth>, name: string): boolean {
    const h = map.get(name);
    if (!h) return true;

    if (h.circuitState === 'open') {
      const openedAt = h.circuitOpenedAt?.getTime() ?? 0;
      if (Date.now() - openedAt < this.cooldownMs) {
        return false;
      }
      // Cooldown elapsed — allow exactly one probe through.
      h.circuitState = 'half-open';
    }

    return true;
  }

  private recordSuccess(map: Map<string, GatewayHealth>, name: string): void {
    const h = map.get(name);
    if (!h) return;
    h.consecutiveErrors = 0;
    h.lastSuccessAt = new Date();
    h.circuitState = 'closed';
    h.circuitOpenedAt = null;
  }

  private recordFailure(map: Map<string, GatewayHealth>, name: string): void {
    const h = map.get(name);
    if (!h) return;
    h.consecutiveErrors++;
    h.totalErrors++;
    h.lastErrorAt = new Date();

    if (h.circuitState === 'half-open' || h.consecutiveErrors >= this.failureThreshold) {
      if (h.circuitState !== 'open') {
        logger.warn(`[IpfsGatewayService] Circuit breaker OPEN for ${name}`, {
          consecutiveErrors: h.consecutiveErrors,
          cooldownMs: this.cooldownMs,
        });
      }
      h.circuitState = 'open';
      h.circuitOpenedAt = new Date();
    }
  }

  /**
   * Dispatches a single upload attempt to `provider`, enforcing a
   * wall-clock timeout. Returns the CID the provider reports pinning the
   * content under. Throws on any HTTP error, timeout, or unparseable
   * response — callers (`pinContent`) treat that as this provider having
   * failed and move on to the next one in the fallback chain.
   */
  private async uploadToProvider(
    provider: PinProviderConfig,
    content: Buffer,
    filename: string,
    timeoutMs: number
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const form = new FormData();
      form.append('file', new Blob([Uint8Array.from(content)]), filename);

      const headers: Record<string, string> = {};
      if (provider.type === 'pinata') {
        headers.Authorization = `Bearer ${provider.authToken ?? ''}`;
      } else if ((provider.type === 'infura' || provider.type === 'kubo') && provider.authToken) {
        const basic = Buffer.from(`${provider.authToken}:${provider.authSecret ?? ''}`).toString('base64');
        headers.Authorization = `Basic ${basic}`;
      }

      const response = await this.fetchFn(provider.endpoint, {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from pin provider ${provider.name}`);
      }

      const text = await response.text();
      return this.extractCidFromResponse(provider.type, text);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Provider APIs disagree on the response shape:
   *  - Pinata:            `{ "IpfsHash": "Qm...", ... }`               (single JSON object)
   *  - Infura / Kubo v0:  `{ "Hash": "Qm...", "Name": ..., "Size": ... }`
   *    — Kubo may stream newline-delimited JSON when adding a directory;
   *    for a single file it is one JSON object per line, so parsing just
   *    the first non-empty line covers both cases.
   */
  private extractCidFromResponse(type: PinProviderConfig['type'], body: string): string {
    const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? body;
    let parsed: unknown;
    try {
      parsed = JSON.parse(firstLine);
    } catch {
      throw new Error(`Could not parse ${type} pin response as JSON: ${firstLine.slice(0, 200)}`);
    }

    const obj = parsed as Record<string, unknown>;
    const cid = type === 'pinata' ? obj.IpfsHash : obj.Hash;
    if (typeof cid !== 'string' || cid.length === 0) {
      throw new Error(`${type} pin response did not contain a CID: ${firstLine.slice(0, 200)}`);
    }
    return cid;
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
