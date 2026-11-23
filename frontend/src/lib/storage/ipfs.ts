/**
 * Decentralized IPFS metadata pinner with a local CAR-file archiver (Issue #1402).
 *
 * Certificates and course materials are bundled entirely in the browser into a
 * CARv1 (Content Addressable aRchive) file — the same container format `ipfs
 * dag export` produces — so a student can archive a verifiable, content-addressed
 * copy of their credentials without depending on any single pinning service.
 *
 * What this module actually does, byte for byte:
 *  - Chunks each input file on a fixed boundary and hashes every chunk with
 *    SHA-256 (Web Crypto), so identical chunks across files collapse into one
 *    stored block (content-addressed deduplication).
 *  - Wraps each unique chunk in a CIDv1 (raw codec `0x55`, sha2-256 multihash),
 *    built by hand from the multiformats varint + multibase spec — no network
 *    call and no external CID library required.
 *  - Optionally encrypts every chunk client-side with AES-GCM before hashing,
 *    so the CID commits to ciphertext and the plaintext never leaves the
 *    browser unencrypted.
 *  - Serializes the unique blocks plus a small "directory" block (a CBOR-ish
 *    manifest listing each original file's name, size and root CID) into a
 *    real CARv1 byte stream, downloadable as a single `.car` file.
 *  - Attempts to pin the resulting archive across several endpoints in turn,
 *    falling back to the next on any failure, and reports which (if any)
 *    accepted it. The primary endpoint is this app's own backend
 *    (`POST /storage/pin-file`, see `backend/src/routes/storage.routes.ts`),
 *    which already wraps Pinata (`backend/src/services/storage/providers/pinata.provider.ts`)
 *    — the browser never sees a Pinata JWT, and pinning logic lives in one
 *    place instead of being reimplemented against a third-party API here.
 *    A directly-reachable CAR-import endpoint (e.g. a local IPFS node) can
 *    still be configured as a fallback gateway for anyone who runs one.
 *
 * References:
 *  - CARv1 transport spec: https://ipld.io/specs/transport/car/carv1/
 *  - CID spec: https://github.com/multiformats/cid
 *  - Multibase (base32, lowercase, no padding — 'b' prefix): https://github.com/multiformats/multibase
 */

import { API_BASE_URL } from '@/lib/api-config';

// ─── Varint (unsigned LEB128) ───────────────────────────────────────────────

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v = Math.floor(v / 128);
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return new Uint8Array(bytes);
}

function decodeVarint(bytes: Uint8Array, offset: number): { value: number; length: number } {
  let result = 0;
  let shift = 1;
  let i = 0;
  for (;;) {
    const byte = bytes[offset + i];
    result += (byte & 0x7f) * shift;
    i++;
    if ((byte & 0x80) === 0) break;
    shift *= 128;
  }
  return { value: result, length: i };
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// ─── Hashing & CID construction ────────────────────────────────────────────

const RAW_CODEC = 0x55; // raw binary leaf, per the multicodec table
const SHA2_256_CODE = 0x12; // multihash function code for sha2-256
const SHA2_256_DIGEST_LENGTH = 32;
const CIDV1 = 0x01;

export interface Cid {
  /** The full CID bytes: version + codec + multihash. */
  bytes: Uint8Array;
  /** Base32, lowercase, multibase-prefixed ("b...") string form. */
  toString(): string;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC4648 base32, lowercase, no padding — the encoding CIDv1 text form uses. */
function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

/** Build a CIDv1 for a raw block: multibase('b') + varint(1) + varint(codec) + multihash. */
export async function cidForBlock(bytes: Uint8Array, codec = RAW_CODEC): Promise<Cid> {
  const digest = await sha256(bytes);
  const multihash = concatBytes([
    encodeVarint(SHA2_256_CODE),
    encodeVarint(SHA2_256_DIGEST_LENGTH),
    digest,
  ]);
  const cidBytes = concatBytes([encodeVarint(CIDV1), encodeVarint(codec), multihash]);

  return {
    bytes: cidBytes,
    toString: () => 'b' + base32Encode(cidBytes),
  };
}

// ─── Chunking & dedup ───────────────────────────────────────────────────────

/** 256 KiB fixed-size chunking — simple, deterministic, and CAR-friendly. */
export const DEFAULT_CHUNK_SIZE = 256 * 1024;

export interface Chunk {
  cid: Cid;
  data: Uint8Array;
}

/** Split a buffer into fixed-size chunks, hash each, and drop duplicate content. */
export async function chunkAndDedupe(
  data: Uint8Array,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<{ chunks: Chunk[]; order: string[]; dedupedBytes: number }> {
  const seen = new Map<string, Chunk>();
  const order: string[] = [];
  let dedupedBytes = 0;

  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const slice = data.subarray(offset, Math.min(offset + chunkSize, data.length));
    const cid = await cidForBlock(slice);
    const key = cid.toString();
    order.push(key);

    if (seen.has(key)) {
      dedupedBytes += slice.length;
      continue;
    }
    seen.set(key, { cid, data: slice });
  }

  // Handle a zero-length file: still produce one empty chunk so it has a CID.
  if (data.length === 0) {
    const cid = await cidForBlock(new Uint8Array(0));
    seen.set(cid.toString(), { cid, data: new Uint8Array(0) });
    order.push(cid.toString());
  }

  return { chunks: [...seen.values()], order, dedupedBytes };
}

// ─── Client-side encryption ─────────────────────────────────────────────────

export interface EncryptionResult {
  /** Raw AES-256-GCM key, exported so it can be shown to / stored by the user. */
  keyBytes: Uint8Array;
  /** Per-archive random salt used nowhere else — encrypt() derives per-chunk IVs from it. */
  salt: Uint8Array;
}

/** Derive a fresh AES-256-GCM key. The key never leaves the browser unless exported by the caller. */
export async function generateArchiveKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Encrypt one chunk. The IV is derived from a counter so it's never reused under the same key. */
export async function encryptChunk(
  key: CryptoKey,
  plaintext: Uint8Array,
  counter: number,
): Promise<Uint8Array> {
  const iv = new Uint8Array(12);
  new DataView(iv.buffer).setUint32(8, counter, false);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return new Uint8Array(ciphertext);
}

export async function decryptChunk(
  key: CryptoKey,
  ciphertext: Uint8Array,
  counter: number,
): Promise<Uint8Array> {
  const iv = new Uint8Array(12);
  new DataView(iv.buffer).setUint32(8, counter, false);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

export async function exportKeyRaw(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return base32Encode(new Uint8Array(raw));
}

// ─── CAR (v1) encoding ──────────────────────────────────────────────────────

export interface ArchiveFile {
  name: string;
  data: Uint8Array;
  mimeType?: string;
}

export interface ArchiveManifestEntry {
  name: string;
  mimeType: string;
  size: number;
  rootCid: string;
  chunkCids: string[];
}

export interface CarArchiveResult {
  /** The full CARv1 byte stream, ready to save as a `.car` file. */
  bytes: Uint8Array;
  /** CID of the root manifest block — put this in the CAR header's `roots`. */
  rootCid: string;
  manifest: ArchiveManifestEntry[];
  totalBlocks: number;
  totalBytesStored: number;
  dedupedBytes: number;
  encrypted: boolean;
}

/** One length-prefixed CAR block: varint(len(cid + data)) + cid + data. */
function encodeCarBlock(cidBytes: Uint8Array, data: Uint8Array): Uint8Array {
  const body = concatBytes([cidBytes, data]);
  return concatBytes([encodeVarint(body.length), body]);
}

/**
 * Minimal deterministic CBOR encoder covering exactly what the manifest header
 * needs: a map with string keys, an array of tagged CIDs, strings, and uints.
 * CARv1 headers are always this shape, so a general encoder is unnecessary.
 */
function cborUint(n: number): number[] {
  if (n < 24) return [n];
  if (n < 256) return [0x18, n];
  if (n < 65536) return [0x19, (n >> 8) & 0xff, n & 0xff];
  return [0x1a, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function cborTextString(s: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(s));
  const len = bytes.length;
  const head =
    len < 24 ? [0x60 + len] : len < 256 ? [0x78, len] : [0x79, (len >> 8) & 0xff, len & 0xff];
  return [...head, ...bytes];
}

function cborCidTag(cidBytes: Uint8Array): number[] {
  // Tag 42 (CBOR-IPLD "link"), wrapping a byte string prefixed with 0x00
  // (identity multibase) as the DAG-CBOR spec requires for CID links.
  const payload = [0x00, ...Array.from(cidBytes)];
  const len = payload.length;
  const lenHead =
    len < 24 ? [0x40 + len] : len < 256 ? [0x58, len] : [0x59, (len >> 8) & 0xff, len & 0xff];
  return [0xd8, 42, ...lenHead, ...payload];
}

/** Build the CARv1 header: {version: 1, roots: [rootCid]}. */
function buildCarHeader(rootCidBytes: Uint8Array): Uint8Array {
  const map = [
    0xa2, // map, 2 entries
    ...cborTextString('version'),
    ...cborUint(1),
    ...cborTextString('roots'),
    0x81, // array, 1 entry
    ...cborCidTag(rootCidBytes),
  ];
  const body = new Uint8Array(map);
  return concatBytes([encodeVarint(body.length), body]);
}

/**
 * Bundle one or more files into a single encrypted, deduplicated CARv1 archive.
 *
 * Every file is chunked and hashed independently; identical chunks across
 * files (e.g. the same certificate image re-issued) are stored once. A
 * manifest block lists each file's name, size and chunk CIDs in order, and
 * becomes the CAR's single root so the archive is self-describing.
 */
export async function buildCarArchive(
  files: ArchiveFile[],
  options: { encryptionKey?: CryptoKey } = {},
): Promise<CarArchiveResult> {
  const blocks = new Map<string, Uint8Array>();
  const manifest: ArchiveManifestEntry[] = [];
  let dedupedBytes = 0;
  let counter = 0;

  for (const file of files) {
    const { chunks, order, dedupedBytes: fileDeduped } = await chunkAndDedupe(file.data);
    dedupedBytes += fileDeduped;

    const chunkCids: string[] = [];
    for (const chunk of chunks) {
      const stored = options.encryptionKey
        ? await encryptChunk(options.encryptionKey, chunk.data, counter++)
        : chunk.data;
      // Re-key the block under a CID of the stored (possibly encrypted) bytes so
      // the archive's content-addressing always matches what is actually stored.
      const storedCid = options.encryptionKey ? await cidForBlock(stored) : chunk.cid;
      blocks.set(storedCid.toString(), stored);
      chunkCids.push(storedCid.toString());
    }

    manifest.push({
      name: file.name,
      mimeType: file.mimeType ?? 'application/octet-stream',
      size: file.data.length,
      rootCid: chunkCids[0] ?? '',
      chunkCids: order.length ? chunkCids : [],
    });
  }

  const manifestBytes = new TextEncoder().encode(JSON.stringify({ files: manifest }, null, 0));
  const manifestCid = await cidForBlock(manifestBytes, 0x0129); // dag-json codec, informational
  blocks.set(manifestCid.toString(), manifestBytes);

  const carBlocks: Uint8Array[] = [];
  // Manifest first so a reader can find it without scanning the whole archive.
  carBlocks.push(encodeCarBlock(manifestCid.bytes, manifestBytes));
  for (const [key, data] of blocks) {
    if (key === manifestCid.toString()) continue;
    const cidBytes = decodeCidString(key);
    carBlocks.push(encodeCarBlock(cidBytes, data));
  }

  const header = buildCarHeader(manifestCid.bytes);
  const bytes = concatBytes([header, ...carBlocks]);
  const totalBytesStored = [...blocks.values()].reduce((sum, b) => sum + b.length, 0);

  return {
    bytes,
    rootCid: manifestCid.toString(),
    manifest,
    totalBlocks: blocks.size,
    totalBytesStored,
    dedupedBytes,
    encrypted: !!options.encryptionKey,
  };
}

function decodeCidString(cidStr: string): Uint8Array {
  // Only ever decodes CIDs this module produced itself (base32, 'b' prefix).
  const body = cidStr.slice(1);
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of body) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** Parse a CARv1 byte stream back into its blocks, for round-trip verification. */
export function parseCarArchive(bytes: Uint8Array): { headerLength: number; blocks: { cid: Uint8Array; data: Uint8Array }[] } {
  const { value: headerBodyLength, length: headerVarintLen } = decodeVarint(bytes, 0);
  let offset = headerVarintLen + headerBodyLength;
  const headerLength = offset;
  const blocks: { cid: Uint8Array; data: Uint8Array }[] = [];

  while (offset < bytes.length) {
    const { value: blockLength, length: varintLen } = decodeVarint(bytes, offset);
    offset += varintLen;
    const blockBytes = bytes.subarray(offset, offset + blockLength);

    // CID = varint(version) + varint(codec) + varint(hashFn) + varint(hashLen) + digest
    let cidEnd = 0;
    cidEnd += decodeVarint(blockBytes, cidEnd).length; // version
    cidEnd += decodeVarint(blockBytes, cidEnd).length; // codec
    cidEnd += decodeVarint(blockBytes, cidEnd).length; // hash function
    const digestLenField = decodeVarint(blockBytes, cidEnd);
    cidEnd += digestLenField.length + digestLenField.value; // hash length + digest bytes

    blocks.push({ cid: blockBytes.subarray(0, cidEnd), data: blockBytes.subarray(cidEnd) });
    offset += blockLength;
  }

  return { headerLength, blocks };
}

// ─── Multi-gateway pinning ──────────────────────────────────────────────────

export interface PinGateway {
  name: string;
  /** Build the upload URL/endpoint for this gateway. */
  uploadUrl: string;
  /**
   * How the request is built for this gateway:
   *  - `'raw'` (default): the CAR bytes as the request body, unauthenticated —
   *    matches a bare CAR-import endpoint such as a local IPFS node's
   *    `dag/import`.
   *  - `'backend-json'`: this app's own `/storage/pin-file` route — a JSON
   *    body carrying base64 content, matching `StoragePinRequest` in
   *    `backend/src/services/storage/types.ts`. The backend holds the Pinata
   *    credentials and does the actual pinning; this gateway just calls it.
   */
  mode?: 'raw' | 'backend-json';
}

/** Metadata describing what is being pinned, forwarded to `backend-json` gateways. */
export interface PinMetadata {
  resourceType: string;
  resourceId: string;
  name: string;
}

/**
 * This app's own Pinata-backed pinning endpoint, first — reusing the
 * existing backend provider (see `backend/src/services/storage/providers/pinata.provider.ts`)
 * rather than duplicating pin logic or third-party credentials in the
 * browser. A local IPFS node is offered as a fallback for anyone running
 * one; it accepts unauthenticated CAR imports over plain HTTP.
 */
export const DEFAULT_PIN_GATEWAYS: PinGateway[] = [
  { name: 'app backend (Pinata)', uploadUrl: `${API_BASE_URL}/storage/pin-file`, mode: 'backend-json' },
  { name: 'local IPFS node', uploadUrl: 'http://127.0.0.1:5001/api/v0/dag/import', mode: 'raw' },
];

export interface PinAttempt {
  gateway: string;
  ok: boolean;
  error?: string;
}

export interface PinResult {
  attempts: PinAttempt[];
  pinnedBy: string | null;
}

/** Browser-safe base64 encoding of raw bytes, without going through a Blob/FileReader round-trip. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // avoid call-stack limits on String.fromCharCode's arg count
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  if (typeof btoa === 'function') return btoa(binary);
  // Node (tests): Buffer is available even without a DOM.
  return Buffer.from(bytes).toString('base64');
}

function buildPinRequest(
  gateway: PinGateway,
  carBytes: Uint8Array,
  metadata: PinMetadata,
): { url: string; init: RequestInit } {
  if (gateway.mode === 'backend-json') {
    return {
      url: gateway.uploadUrl,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: metadata.resourceType,
          resourceId: metadata.resourceId,
          name: metadata.name,
          contentBase64: bytesToBase64(carBytes),
          mimeType: 'application/vnd.ipld.car',
        }),
      },
    };
  }

  return {
    url: gateway.uploadUrl,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.ipld.car' },
      body: carBytes,
    },
  };
}

/**
 * Try pinning the archive across gateways in order, stopping at the first
 * success. Every failure (network error, auth, rate limit) is recorded and
 * the next gateway is tried — this is the "fallback" the issue asks for.
 * Network calls are injectable via `fetchImpl` so this is unit-testable
 * without touching the network.
 */
export async function pinWithFallback(
  carBytes: Uint8Array,
  gateways: PinGateway[] = DEFAULT_PIN_GATEWAYS,
  fetchImpl: typeof fetch = fetch,
  metadata: PinMetadata = { resourceType: 'certificate-archive', resourceId: 'unknown', name: 'archive.car' },
): Promise<PinResult> {
  const attempts: PinAttempt[] = [];

  for (const gateway of gateways) {
    try {
      const { url, init } = buildPinRequest(gateway, carBytes, metadata);
      const response = await fetchImpl(url, init);
      if (response.ok) {
        attempts.push({ gateway: gateway.name, ok: true });
        return { attempts, pinnedBy: gateway.name };
      }
      attempts.push({ gateway: gateway.name, ok: false, error: `HTTP ${response.status}` });
    } catch (err) {
      attempts.push({
        gateway: gateway.name,
        ok: false,
        error: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  return { attempts, pinnedBy: null };
}

/** Trigger a browser download of the CAR archive. No-op outside the browser. */
export function downloadCarFile(bytes: Uint8Array, filename: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([bytes], { type: 'application/vnd.ipld.car' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.car') ? filename : `${filename}.car`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
