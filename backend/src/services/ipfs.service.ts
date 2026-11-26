/**
 * Multi-Provider IPFS Pinning Cluster Service — Issue BE-064
 *
 * Refactors IPFS uploads into a fault-tolerant, multi-provider pinning cluster
 * that dispatches parallel pins across Pinata, Infura, and an internal IPFS
 * Kubo cluster node.
 *
 * Key guarantees:
 *  - Parallel dispatch with failover: certificate metadata and diploma asset
 *    uploads succeed even if one or more pinning providers are offline or
 *    rate-limited, as long as at least `minSuccessfulProviders` (default 1)
 *    succeed.
 *  - Cryptographic CID consistency: all providers are instructed to use
 *    CIDv1 + sha2-256, and every returned CID is validated and cross-checked.
 *    A mismatch across providers raises `CidMismatchError`.
 *  - Content integrity verification: SHA-256 digests are computed before
 *    upload and optionally verified via gateway read-back before returning,
 *    catching corrupted uploads (`ContentIntegrityError`) before database
 *    persistence.
 */

import crypto from 'crypto';
import { ipfsClusterConfig, type IpfsClusterConfig } from '../config/ipfs.config.js';
import {
  IpfsGatewayService,
  ipfsGatewayService,
  isValidCid,
  type GatewayHealth,
  type PinProviderConfig,
} from './ipfs.gateway.service.js';
import logger from '../utils/logger.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class CidMismatchError extends Error {
  readonly providerCids: Record<string, string>;

  constructor(providerCids: Record<string, string>) {
    const summary = Object.entries(providerCids)
      .map(([provider, cid]) => `${provider}=${cid}`)
      .join(', ');
    super(`IPFS CID mismatch across pinning providers: ${summary}`);
    this.name = 'CidMismatchError';
    this.providerCids = providerCids;
  }
}

export class ContentIntegrityError extends Error {
  readonly expectedSha256: string;
  readonly actualSha256: string;
  readonly cid?: string;

  constructor(expectedSha256: string, actualSha256: string, cid?: string) {
    super(
      `IPFS content integrity verification failed${cid ? ` for CID=${cid}` : ''}: ` +
        `expected sha256=${expectedSha256}, actual sha256=${actualSha256}`
    );
    this.name = 'ContentIntegrityError';
    this.expectedSha256 = expectedSha256;
    this.actualSha256 = actualSha256;
    this.cid = cid;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderPinOutcome {
  provider: string;
  cid: string;
  latencyMs: number;
}

export interface ProviderPinFailure {
  provider: string;
  error: string;
}

export interface ClusterPinResult {
  /** Canonical CID verified across all successful providers. */
  cid: string;
  /** SHA-256 hex digest of the pinned content. */
  sha256: string;
  /** Payload size in bytes. */
  sizeBytes: number;
  /** First successful provider (primary responder). */
  primaryProvider: string;
  /** All providers that successfully pinned the content. */
  pinnedProviders: ProviderPinOutcome[];
  /** Providers that failed or timed out during parallel dispatch. */
  failedProviders: ProviderPinFailure[];
  /** True when all successful providers returned the exact same CID. */
  cidConsistent: boolean;
  /** True when SHA-256 content integrity verification succeeded. */
  integrityVerified: boolean;
}

export interface PinOptions {
  /** Optional expected SHA-256 hex digest to verify before uploading. */
  expectedSha256?: string;
  /** Override cluster-level read-back integrity verification for this call. */
  verifyContentIntegrity?: boolean;
  /** Override cluster-level CID consistency enforcement for this call. */
  verifyCidConsistency?: boolean;
}

export interface IpfsServiceOptions {
  config?: Partial<IpfsClusterConfig>;
  fetchFn?: typeof fetch;
  gatewayService?: IpfsGatewayService;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class IpfsService {
  private static instance: IpfsService | null = null;

  private readonly providers: PinProviderConfig[];
  private readonly minSuccessfulProviders: number;
  private readonly verifyCidConsistency: boolean;
  private readonly verifyContentIntegrity: boolean;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly gatewayService: IpfsGatewayService;

  private readonly providerHealth = new Map<string, GatewayHealth>();

  constructor(options: IpfsServiceOptions = {}) {
    const merged: IpfsClusterConfig = {
      ...ipfsClusterConfig,
      ...options.config,
      circuitBreaker: {
        ...ipfsClusterConfig.circuitBreaker,
        ...options.config?.circuitBreaker,
      },
    };

    this.providers = merged.providers.filter((p) => p.enabled !== false);
    this.minSuccessfulProviders = merged.minSuccessfulProviders;
    this.verifyCidConsistency = merged.verifyCidConsistency;
    this.verifyContentIntegrity = merged.verifyContentIntegrity;
    this.failureThreshold = merged.circuitBreaker.failureThreshold;
    this.cooldownMs = merged.circuitBreaker.cooldownMs;
    this.fetchFn = options.fetchFn ?? fetch;
    this.gatewayService = options.gatewayService ?? ipfsGatewayService;

    for (const provider of this.providers) {
      this.providerHealth.set(provider.name, {
        name: provider.name,
        consecutiveErrors: 0,
        totalRequests: 0,
        totalErrors: 0,
        lastSuccessAt: null,
        lastErrorAt: null,
        circuitState: 'closed',
        circuitOpenedAt: null,
      });
    }
  }

  static getInstance(options?: IpfsServiceOptions): IpfsService {
    if (!IpfsService.instance) {
      IpfsService.instance = new IpfsService(options);
    }
    return IpfsService.instance;
  }

  /** Computes the SHA-256 hex digest of a buffer. */
  computeSha256(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Dispatches parallel pin requests across all healthy configured providers
   * (Pinata, Infura, internal Kubo cluster node).
   *
   * Succeeds as long as at least `minSuccessfulProviders` succeed, verifies
   * that all returned CIDs are cryptographically identical, and optionally
   * verifies SHA-256 content integrity via gateway read-back before returning.
   */
  async pinContent(
    content: Buffer,
    filename = 'asset.bin',
    options: PinOptions = {}
  ): Promise<ClusterPinResult> {
    if (this.providers.length === 0) {
      throw new Error(
        'No IPFS pinning providers configured. Configure Pinata, Infura, or a local Kubo node.'
      );
    }

    const sha256 = this.computeSha256(content);

    if (options.expectedSha256 && options.expectedSha256 !== sha256) {
      throw new ContentIntegrityError(options.expectedSha256, sha256);
    }

    const activeProviders = this.providers.filter((p) => this.canAttempt(p.name));
    if (activeProviders.length === 0) {
      throw new Error(
        `All IPFS pinning providers have open circuit breakers for ${filename}.`
      );
    }

    const settled = await Promise.allSettled(
      activeProviders.map(async (provider): Promise<ProviderPinOutcome> => {
        const health = this.providerHealth.get(provider.name);
        if (health) health.totalRequests++;

        const startTs = Date.now();
        try {
          const cid = await this.uploadToProvider(provider, content, filename);
          if (!isValidCid(cid)) {
            throw new Error(`Provider ${provider.name} returned a malformed CID: "${cid}"`);
          }
          const latencyMs = Date.now() - startTs;
          this.recordSuccess(provider.name);
          return { provider: provider.name, cid, latencyMs };
        } catch (err) {
          this.recordFailure(provider.name);
          throw err instanceof Error ? err : new Error(String(err));
        }
      })
    );

    const pinnedProviders: ProviderPinOutcome[] = [];
    const failedProviders: ProviderPinFailure[] = [];
    const errors: Error[] = [];

    settled.forEach((outcome, idx) => {
      const provider = activeProviders[idx]!;
      if (outcome.status === 'fulfilled') {
        pinnedProviders.push(outcome.value);
      } else {
        const err =
          outcome.reason instanceof Error
            ? outcome.reason
            : new Error(String(outcome.reason));
        errors.push(err);
        failedProviders.push({ provider: provider.name, error: err.message });
        logger.warn(`[IpfsService] Parallel pin failed for ${provider.name}`, {
          filename,
          error: err.message,
        });
      }
    });

    if (pinnedProviders.length < this.minSuccessfulProviders) {
      throw new AggregateError(
        errors,
        `IPFS cluster pin failed for ${filename}: ${pinnedProviders.length}/${this.minSuccessfulProviders} required providers succeeded`
      );
    }

    // Verify CID consistency across all successful providers
    const uniqueCids = new Set(pinnedProviders.map((p) => p.cid));
    const cidConsistent = uniqueCids.size === 1;
    const enforceCidConsistency = options.verifyCidConsistency ?? this.verifyCidConsistency;

    if (enforceCidConsistency && !cidConsistent) {
      const providerCids = Object.fromEntries(
        pinnedProviders.map((p) => [p.provider, p.cid])
      );
      logger.error('[IpfsService] CID mismatch detected across providers', {
        filename,
        providerCids,
      });
      throw new CidMismatchError(providerCids);
    }

    const primary = pinnedProviders[0]!;
    const shouldVerifyIntegrity =
      options.verifyContentIntegrity ?? this.verifyContentIntegrity;
    let integrityVerified = Boolean(options.expectedSha256);

    if (shouldVerifyIntegrity) {
      await this.verifyPinnedContent(primary.cid, sha256);
      integrityVerified = true;
    }

    logger.info(`[IpfsService] Pinned ${filename} across ${pinnedProviders.length} provider(s)`, {
      cid: primary.cid,
      sha256,
      providers: pinnedProviders.map((p) => p.provider),
      failed: failedProviders.map((f) => f.provider),
    });

    return {
      cid: primary.cid,
      sha256,
      sizeBytes: content.length,
      primaryProvider: primary.provider,
      pinnedProviders,
      failedProviders,
      cidConsistent,
      integrityVerified,
    };
  }

  /**
   * Pins certificate JSON metadata across the multi-provider cluster.
   */
  async pinJson(
    metadata: Record<string, unknown>,
    filename = 'metadata.json',
    options: PinOptions = {}
  ): Promise<ClusterPinResult> {
    const buffer = Buffer.from(JSON.stringify(metadata), 'utf8');
    return this.pinContent(buffer, filename, options);
  }

  /**
   * Pins a diploma / certificate asset (Buffer or UTF-8 string such as SVG)
   * across the multi-provider cluster.
   */
  async pinDiplomaAsset(
    asset: Buffer | string,
    filename = 'diploma.svg',
    options: PinOptions = {}
  ): Promise<ClusterPinResult> {
    const buffer = typeof asset === 'string' ? Buffer.from(asset, 'utf8') : asset;
    return this.pinContent(buffer, filename, options);
  }

  /**
   * Verifies that content retrievable for `cid` matches `expectedSha256`.
   * Throws `ContentIntegrityError` if the fetched content is corrupted.
   */
  async verifyPinnedContent(cid: string, expectedSha256: string): Promise<void> {
    const fetched = await this.gatewayService.fetchByCid(cid);
    if (fetched.sha256 !== expectedSha256) {
      throw new ContentIntegrityError(expectedSha256, fetched.sha256, cid);
    }
  }

  /** Returns a snapshot of per-provider health and circuit-breaker state. */
  getProviderHealth(): GatewayHealth[] {
    return Array.from(this.providerHealth.values()).map((h) => ({ ...h }));
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async uploadToProvider(
    provider: PinProviderConfig,
    content: Buffer,
    filename: string
  ): Promise<string> {
    const timeoutMs = provider.timeoutMs ?? 20_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const form = new FormData();
      form.append('file', new Blob([Uint8Array.from(content)]), filename);

      const headers: Record<string, string> = {};
      let url = provider.endpoint;

      if (provider.type === 'pinata') {
        headers.Authorization = `Bearer ${provider.authToken ?? ''}`;
        form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
      } else {
        if (provider.authToken) {
          const basic = Buffer.from(
            `${provider.authToken}:${provider.authSecret ?? ''}`
          ).toString('base64');
          headers.Authorization = `Basic ${basic}`;
        }
        if (!url.includes('cid-version=')) {
          const sep = url.includes('?') ? '&' : '?';
          url = `${url}${sep}cid-version=1&hash=sha2-256&pin=true`;
        }
      }

      const response = await this.fetchFn(url, {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from pin provider ${provider.name}`);
      }

      const text = await response.text();
      return this.extractCid(provider.type, text);
    } finally {
      clearTimeout(timer);
    }
  }

  private extractCid(type: PinProviderConfig['type'], body: string): string {
    const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? body;
    let parsed: unknown;
    try {
      parsed = JSON.parse(firstLine);
    } catch {
      throw new Error(`Invalid JSON from ${type} pin provider: ${firstLine.slice(0, 200)}`);
    }

    const obj = parsed as Record<string, unknown>;
    const cid = type === 'pinata' ? obj.IpfsHash : obj.Hash;
    if (typeof cid !== 'string' || cid.length === 0) {
      throw new Error(`${type} pin provider response did not include a CID`);
    }
    return cid;
  }

  private canAttempt(name: string): boolean {
    const h = this.providerHealth.get(name);
    if (!h) return true;
    if (h.circuitState === 'open') {
      const openedAt = h.circuitOpenedAt?.getTime() ?? 0;
      if (Date.now() - openedAt < this.cooldownMs) {
        return false;
      }
      h.circuitState = 'half-open';
    }
    return true;
  }

  private recordSuccess(name: string): void {
    const h = this.providerHealth.get(name);
    if (!h) return;
    h.consecutiveErrors = 0;
    h.lastSuccessAt = new Date();
    h.circuitState = 'closed';
    h.circuitOpenedAt = null;
  }

  private recordFailure(name: string): void {
    const h = this.providerHealth.get(name);
    if (!h) return;
    h.consecutiveErrors++;
    h.totalErrors++;
    h.lastErrorAt = new Date();
    if (h.circuitState === 'half-open' || h.consecutiveErrors >= this.failureThreshold) {
      h.circuitState = 'open';
      h.circuitOpenedAt = new Date();
    }
  }
}

export const ipfsService = IpfsService.getInstance();
