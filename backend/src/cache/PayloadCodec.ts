/**
 * PayloadCodec.ts — Issue #1139
 *
 * Compresses large cached payloads (e.g. serialized curriculum trees) with
 * native Node.js Brotli before they are written to Redis, and transparently
 * decompresses on read. Small payloads bypass compression to avoid overhead.
 *
 * Wire formats handled on read:
 *  • plain JSON string                     — legacy / uncompressed entries
 *  • Buffer starting with `BR1` (binary)   — Brotli-compressed (Redis path)
 *  • string starting with `BRB` (base64)   — Brotli-compressed (memory store)
 */

import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
} from 'node:zlib';

/** Entries larger than this (bytes) are compressed before storing. */
export const COMPRESSION_MIN_BYTES = 1024;

/** Magic banner identifying a binary Brotli-compressed value. */
const MAGIC_BIN = 'BR1';
/** Magic banner identifying a base64 Brotli-compressed value (memory store). */
const MAGIC_B64 = 'BRB';

export interface PayloadCodecOptions {
  /** Values larger than this encoded size (bytes) are compressed. */
  compressionMinBytes?: number;
  /** Brotli quality 0..11 (higher = better ratio, slower). Default 6. */
  brotliQuality?: number;
}

function compressJson(json: string, opts: PayloadCodecOptions): Buffer {
  return brotliCompressSync(Buffer.from(json, 'utf8'), {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: opts.brotliQuality ?? 6,
    },
  });
}

function decompressJson(buffer: Buffer) {
  return JSON.parse(brotliDecompressSync(buffer).toString('utf8'));
}

/**
 * Serialize a JS value to the wire format for Redis: a plain JSON string when
 * small, or a Buffer (`BR1` prefix) of Brotli-compressed JSON when large.
 */
export function encodePayload(
  value: unknown,
  opts: PayloadCodecOptions = {}
): string | Buffer {
  const json = JSON.stringify(value);
  const threshold = opts.compressionMinBytes ?? COMPRESSION_MIN_BYTES;

  if (Buffer.byteLength(json) < threshold) {
    return json;
  }

  return Buffer.concat([
    Buffer.from(MAGIC_BIN, 'utf8'),
    compressJson(json, opts),
  ]);
}

/**
 * Encode a payload for storage in a string-only store (the in-memory fallback).
 * Small payloads are stored as plain JSON; large ones as a base64 string under
 * the `BRB` banner so reads can decompress them unambiguously.
 */
export function toStorageString(payload: string | Buffer): string {
  if (typeof payload === 'string') return payload;
  return MAGIC_B64 + payload.subarray(MAGIC_BIN.length).toString('base64');
}

/**
 * Deserialize a raw value read back from a store into the original JS object.
 */
export function decodePayload(raw: string | Buffer): unknown {
  if (typeof raw === 'string') {
    if (raw.startsWith(MAGIC_B64)) {
      return decompressJson(Buffer.from(raw.slice(MAGIC_B64.length), 'base64'));
    }
    // Plain JSON string (legacy / uncompressed).
    return JSON.parse(raw);
  }
  // Buffer from the Redis `getBuffer` path.
  if (raw.subarray(0, MAGIC_BIN.length).toString('utf8') === MAGIC_BIN) {
    return decompressJson(raw.subarray(MAGIC_BIN.length));
  }
  return JSON.parse(raw.toString('utf8'));
}