/**
 * IPFS / Filecoin Pinning Pipeline — Issue BE-011
 *
 * Dual-pinning pipeline for certificate metadata, certificate SVGs and course
 * media:
 *
 *   1. Hot pin — the asset is pinned to IPFS through the ordered `hot`
 *      providers (Pinata → Kubo). Each provider is retried with exponential
 *      backoff + jitter before falling back to the next one.
 *   2. CID validation — the returned CID must be a well-formed CIDv1
 *      (base32 multibase, version 1, sha2-256 multihash); anything else is
 *      treated as a provider failure.
 *   3. Persistence — the immutable CID is stored in PostgreSQL
 *      (`pinned_assets`, guarded by a trigger that forbids rewriting a CID).
 *   4. Filecoin — the same bytes are uploaded in the background to the
 *      `filecoin` provider (Web3.Storage) which brokers persistent storage
 *      deals; status is tracked per asset.
 *   5. Gateway verification — the CID is fetched through the Cloudflare CDN
 *      gateway (warming its cache for active assets) and, on failure, through
 *      the secondary gateways, again with exponential backoff.
 *
 * `autoPinCertificate()` runs steps 1–3 for a freshly issued certificate under
 * a 3-second deadline; steps 4–5 continue asynchronously.
 */

import { createHash } from 'crypto';
import { ipfsConfig, type IpfsConfig, type PinningProviderConfig } from '../config/ipfs.js';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';

// ─── CIDv1 validation ────────────────────────────────────────────────────────

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const SHA2_256 = 0x12;

function base32Decode(input: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function readVarint(bytes: Uint8Array, offset: number): [number, number] | null {
  let value = 0;
  let shift = 0;
  for (let i = offset; i < bytes.length && i < offset + 9; i += 1) {
    const byte = bytes[i]!;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, i + 1];
    shift += 7;
  }
  return null;
}

/**
 * Strict CIDv1 check: base32 multibase prefix `b`, version varint = 1, a codec
 * varint, and a complete sha2-256 multihash (code 0x12, 32-byte digest).
 */
export function isCidV1(cid: string): boolean {
  if (typeof cid !== 'string' || !/^b[a-z2-7]{50,}$/.test(cid)) return false;
  const bytes = base32Decode(cid.slice(1));
  if (!bytes) return false;

  const version = readVarint(bytes, 0);
  if (!version || version[0] !== 1) return false;
  const codec = readVarint(bytes, version[1]);
  if (!codec) return false;
  const hashCode = readVarint(bytes, codec[1]);
  if (!hashCode || hashCode[0] !== SHA2_256) return false;
  const digestLength = readVarint(bytes, hashCode[1]);
  if (!digestLength || digestLength[0] !== 32) return false;

  return digestLength[1] + digestLength[0] === bytes.length;
}

// ─── Retry helper ────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  // Full jitter keeps concurrent retries from synchronising.
  return Math.round(exponential / 2 + Math.random() * (exponential / 2));
}

async function withRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  options: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; deadline?: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts - 1) break;
      const delay = backoffDelay(attempt, options.baseDelayMs, options.maxDelayMs);
      if (options.deadline && Date.now() + delay >= options.deadline) break;
      logger.debug(`${label} attempt ${attempt + 1} failed; retrying in ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PinAssetRequest {
  content: Buffer;
  name: string;
  contentType: string;
  /** e.g. `certificate`, `course`. */
  resourceType: string;
  resourceId: string;
  /** e.g. `certificate-metadata`, `certificate-svg`, `course-video`. */
  kind: string;
}

export interface PinnedAssetRecord {
  id: string;
  resourceType: string;
  resourceId: string;
  kind: string;
  cid: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  provider: string;
  filecoinProvider: string | null;
  filecoinCid: string | null;
  filecoinStatus: string;
  cdnUrl: string;
  gatewayVerified: boolean;
  verifiedGateway: string | null;
  verifiedAt: Date | null;
  pinLatencyMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GatewayCheckResult {
  cid: string;
  accessible: boolean;
  gateway: string | null;
  attempts: Array<{ gateway: string; ok: boolean; status?: number; error?: string }>;
}

export interface CertificatePinRequest {
  certificateId: string;
  metadata: Record<string, unknown>;
  /** Optional pre-rendered SVG; one is rendered from the metadata otherwise. */
  svg?: string;
}

export interface CertificatePinResult {
  certificateId: string;
  svg: PinnedAssetRecord;
  metadata: PinnedAssetRecord;
  elapsedMs: number;
  withinSla: boolean;
}

export interface IpfsPinningServiceOptions {
  config?: IpfsConfig;
  fetchFn?: typeof fetch;
  /** Persistence override (tests). Defaults to Prisma `pinnedAsset`. */
  repository?: PinnedAssetRepository;
}

export interface PinnedAssetRepository {
  upsert(record: Omit<PinnedAssetRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PinnedAssetRecord>;
  update(id: string, patch: Partial<PinnedAssetRecord>): Promise<PinnedAssetRecord>;
  findByCid(cid: string): Promise<PinnedAssetRecord[]>;
  findByResource(resourceType: string, resourceId: string): Promise<PinnedAssetRecord[]>;
}

const db = prisma as any;

export const prismaPinnedAssetRepository: PinnedAssetRepository = {
  async upsert(record) {
    // The CID of an existing (resourceType, resourceId, kind) is never
    // rewritten — only the mutable status fields are refreshed.
    return db.pinnedAsset.upsert({
      where: {
        resourceType_resourceId_kind: {
          resourceType: record.resourceType,
          resourceId: record.resourceId,
          kind: record.kind,
        },
      },
      create: record,
      update: { cdnUrl: record.cdnUrl },
    });
  },
  update(id, patch) {
    return db.pinnedAsset.update({ where: { id }, data: patch });
  },
  findByCid(cid) {
    return db.pinnedAsset.findMany({ where: { cid }, orderBy: { createdAt: 'asc' } });
  },
  findByResource(resourceType, resourceId) {
    return db.pinnedAsset.findMany({ where: { resourceType, resourceId }, orderBy: { createdAt: 'asc' } });
  },
};

// ─── Service ─────────────────────────────────────────────────────────────────

const XML_ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

/** Minimal, deterministic certificate SVG rendered from NFT metadata. */
export function renderCertificateSvg(metadata: Record<string, unknown>): string {
  const name = escapeXml(String(metadata.name ?? 'Certificate of Completion'));
  const description = escapeXml(String(metadata.description ?? '').slice(0, 140));
  const attributes = Array.isArray(metadata.attributes) ? (metadata.attributes as Array<Record<string, unknown>>) : [];
  const lines = attributes
    .slice(0, 6)
    .map(
      (attr, i) =>
        `<text x="80" y="${330 + i * 34}" font-size="20" fill="#334155">${escapeXml(
          `${String(attr.trait_type ?? '')}: ${String(attr.value ?? '')}`,
        )}</text>`,
    )
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">` +
    `<rect width="1200" height="800" fill="#f8fafc"/>` +
    `<rect x="30" y="30" width="1140" height="740" fill="none" stroke="#0f172a" stroke-width="4"/>` +
    `<text x="80" y="150" font-size="44" font-weight="700" fill="#0f172a">${name}</text>` +
    `<text x="80" y="220" font-size="22" fill="#475569">${description}</text>` +
    lines +
    `<text x="80" y="720" font-size="18" fill="#64748b">Web3 Student Lab · Verifiable on IPFS</text>` +
    `</svg>`
  );
}

export class IpfsPinningService {
  private readonly config: IpfsConfig;
  private readonly fetchFn: typeof fetch;
  private readonly repository: PinnedAssetRepository;

  constructor(options: IpfsPinningServiceOptions = {}) {
    this.config = options.config ?? ipfsConfig;
    this.fetchFn = options.fetchFn ?? fetch;
    this.repository = options.repository ?? prismaPinnedAssetRepository;
  }

  /** Public, CDN-cached URL for a CID. */
  cdnUrl(cid: string): string {
    return `${this.config.cdnBaseUrl}/ipfs/${cid}`;
  }

  gatewayUrls(cid: string): string[] {
    return [this.config.cdnBaseUrl, ...this.config.secondaryGateways].map((base) => `${base}/ipfs/${cid}`);
  }

  /**
   * Pin an asset (hot IPFS pin + DB record) and schedule Filecoin storage and
   * gateway verification in the background.
   */
  async pinAsset(request: PinAssetRequest, deadline?: number): Promise<PinnedAssetRecord> {
    const started = Date.now();
    const sha256 = createHash('sha256').update(request.content).digest('hex');
    const { cid, provider } = await this.pinHot(request, deadline);

    const filecoin = this.config.providers.find((p) => p.role === 'filecoin');
    const record = await this.repository.upsert({
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      kind: request.kind,
      cid,
      contentType: request.contentType,
      sizeBytes: request.content.length,
      sha256,
      provider,
      filecoinProvider: filecoin?.name ?? null,
      filecoinCid: null,
      filecoinStatus: filecoin ? 'pending' : 'disabled',
      cdnUrl: this.cdnUrl(cid),
      gatewayVerified: false,
      verifiedGateway: null,
      verifiedAt: null,
      pinLatencyMs: Date.now() - started,
    });

    if (record.cid !== cid) {
      logger.warn('Re-pinned asset produced a different CID; keeping the original immutable CID', {
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        kind: request.kind,
        storedCid: record.cid,
        newCid: cid,
      });
    }

    void this.completeInBackground(record, request, filecoin);
    return record;
  }

  /**
   * Auto-pin a newly issued certificate: SVG first (so metadata can reference
   * it as `image`), then the metadata JSON — all within the configured SLA.
   */
  async autoPinCertificate(request: CertificatePinRequest): Promise<CertificatePinResult> {
    const started = Date.now();
    const deadline = started + this.config.certificatePinSlaMs;

    const svgContent = request.svg ?? renderCertificateSvg(request.metadata);
    const svg = await this.pinAsset(
      {
        content: Buffer.from(svgContent, 'utf8'),
        name: `certificate-${request.certificateId}.svg`,
        contentType: 'image/svg+xml',
        resourceType: 'certificate',
        resourceId: request.certificateId,
        kind: 'certificate-svg',
      },
      deadline,
    );

    const metadata = await this.pinAsset(
      {
        content: Buffer.from(JSON.stringify({ ...request.metadata, image: `ipfs://${svg.cid}` }), 'utf8'),
        name: `certificate-${request.certificateId}.json`,
        contentType: 'application/json',
        resourceType: 'certificate',
        resourceId: request.certificateId,
        kind: 'certificate-metadata',
      },
      deadline,
    );

    const elapsedMs = Date.now() - started;
    const withinSla = elapsedMs <= this.config.certificatePinSlaMs;
    const logMeta = {
      certificateId: request.certificateId,
      metadataCid: metadata.cid,
      svgCid: svg.cid,
      elapsedMs,
      slaMs: this.config.certificatePinSlaMs,
    };
    if (withinSla) {
      logger.info('Certificate pinned to IPFS', logMeta);
    } else {
      logger.warn('Certificate pinned to IPFS after the SLA deadline', logMeta);
    }

    return { certificateId: request.certificateId, svg, metadata, elapsedMs, withinSla };
  }

  /**
   * Check that a CID is retrievable: the CDN gateway first, then each
   * secondary gateway, retrying each with exponential backoff.
   */
  async verifyGatewayAccessibility(cid: string, maxAttemptsPerGateway = 2): Promise<GatewayCheckResult> {
    if (!isCidV1(cid)) throw new Error(`Not a valid CIDv1: ${cid}`);

    const attempts: GatewayCheckResult['attempts'] = [];
    for (const url of this.gatewayUrls(cid)) {
      try {
        const status = await withRetry(
          `gateway ${url}`,
          async () => {
            const response = await this.fetchFn(url, {
              method: 'HEAD',
              signal: AbortSignal.timeout(this.config.retry.attemptTimeoutMs * 2),
            });
            if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
            return response.status;
          },
          { ...this.config.retry, maxAttempts: maxAttemptsPerGateway },
        );
        attempts.push({ gateway: url, ok: true, status });
        return { cid, accessible: true, gateway: url, attempts };
      } catch (error) {
        attempts.push({
          gateway: url,
          ok: false,
          ...(typeof (error as { status?: number }).status === 'number'
            ? { status: (error as { status: number }).status }
            : {}),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { cid, accessible: false, gateway: null, attempts };
  }

  findByCid(cid: string): Promise<PinnedAssetRecord[]> {
    return this.repository.findByCid(cid);
  }

  findByResource(resourceType: string, resourceId: string): Promise<PinnedAssetRecord[]> {
    return this.repository.findByResource(resourceType, resourceId);
  }

  /** Re-run gateway verification for a stored asset and persist the result. */
  async reverify(record: PinnedAssetRecord): Promise<GatewayCheckResult> {
    const check = await this.verifyGatewayAccessibility(record.cid);
    await this.repository.update(record.id, {
      gatewayVerified: check.accessible,
      verifiedGateway: check.gateway,
      verifiedAt: check.accessible ? new Date() : record.verifiedAt,
    });
    return check;
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async pinHot(request: PinAssetRequest, deadline?: number): Promise<{ cid: string; provider: string }> {
    const providers = this.config.providers.filter((p) => p.role === 'hot');
    const errors: Error[] = [];

    for (const provider of providers) {
      if (deadline && Date.now() >= deadline) break;
      try {
        const cid = await withRetry(
          `pin ${provider.name}`,
          async () => {
            const result = await this.upload(provider, request);
            if (!isCidV1(result)) throw new Error(`${provider.name} returned a non-CIDv1 identifier "${result}"`);
            return result;
          },
          { ...this.config.retry, ...(deadline ? { deadline } : {}) },
        );
        return { cid, provider: provider.name };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        logger.warn(`IPFS provider ${provider.name} failed; falling back`, { error: err.message, name: request.name });
      }
    }

    throw new AggregateError(errors, `All IPFS pinning providers failed for ${request.name}`);
  }

  private async completeInBackground(
    record: PinnedAssetRecord,
    request: PinAssetRequest,
    filecoin: PinningProviderConfig | undefined,
  ): Promise<void> {
    if (filecoin) {
      try {
        const filecoinCid = await withRetry(`filecoin ${filecoin.name}`, () => this.upload(filecoin, request), {
          ...this.config.retry,
          maxAttempts: this.config.retry.maxAttempts + 2,
        });
        if (filecoinCid !== record.cid) {
          logger.warn('Filecoin provider returned a different CID (different DAG layout)', {
            cid: record.cid,
            filecoinCid,
          });
        }
        await this.repository.update(record.id, { filecoinCid, filecoinStatus: 'stored' });
      } catch (error) {
        logger.error('Filecoin storage deal upload failed', {
          cid: record.cid,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.repository.update(record.id, { filecoinStatus: 'failed' }).catch(() => undefined);
      }
    }

    try {
      await this.reverify(record);
    } catch (error) {
      logger.warn('Gateway verification failed', {
        cid: record.cid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async upload(provider: PinningProviderConfig, request: PinAssetRequest): Promise<string> {
    const signal = AbortSignal.timeout(this.config.retry.attemptTimeoutMs);
    const blob = new Blob([Uint8Array.from(request.content)], { type: request.contentType });
    const headers: Record<string, string> = {};
    let url = provider.endpoint;
    let body: FormData | Blob;

    if (provider.type === 'pinata') {
      headers.Authorization = `Bearer ${provider.authToken ?? ''}`;
      const form = new FormData();
      form.append('file', blob, request.name);
      form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
      form.append(
        'pinataMetadata',
        JSON.stringify({ name: request.name, keyvalues: { kind: request.kind, resourceId: request.resourceId } }),
      );
      body = form;
    } else if (provider.type === 'kubo') {
      if (provider.authToken) {
        headers.Authorization = `Basic ${Buffer.from(`${provider.authToken}:${provider.authSecret ?? ''}`).toString('base64')}`;
      }
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}cid-version=1&hash=sha2-256&pin=true`;
      const form = new FormData();
      form.append('file', blob, request.name);
      body = form;
    } else {
      headers.Authorization = `Bearer ${provider.authToken ?? ''}`;
      headers['X-Name'] = encodeURIComponent(request.name);
      headers['Content-Type'] = request.contentType;
      body = blob;
    }

    const response = await this.fetchFn(url, { method: 'POST', headers, body, signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${provider.name}`);
    }

    const text = await response.text();
    const firstLine = text.split('\n').find((line) => line.trim().length > 0) ?? text;
    const parsed = JSON.parse(firstLine) as Record<string, unknown>;
    const cid = provider.type === 'pinata' ? parsed.IpfsHash : provider.type === 'kubo' ? parsed.Hash : parsed.cid;
    if (typeof cid !== 'string' || cid.length === 0) {
      throw new Error(`${provider.name} response did not contain a CID`);
    }
    return cid;
  }
}

export const ipfsPinningService = new IpfsPinningService();
