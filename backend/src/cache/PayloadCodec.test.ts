import { describe, expect, it } from 'vitest';
import { encodePayload, decodePayload, toStorageString, COMPRESSION_MIN_BYTES } from './PayloadCodec.js';

/** Synthesise a large-ish curriculum-tree-like object. */
function bigCurriculumTree(size = 3_000) {
  const node = (i: number) => ({
    id: `lesson-${i}`,
    title: `Contrato Inteligente Avanzado #${i}: Whole-Self Sovereign Stellar`,
    description: 'A'.repeat(60),
    modules: Array.from({ length: 5 }, (_, m) => ({
      slug: `module-${i}-${m}`,
      order: m,
      status: m % 2 ? 'published' : 'draft',
    })),
  });
  return Array.from({ length: size }, (_, i) => node(i));
}

describe('PayloadCodec (issue #1139)', () => {
  it('keeps small payloads uncompressed', () => {
    const small = { hello: 'world' };
    const encoded = encodePayload(small);
    expect(Buffer.isBuffer(encoded)).toBe(false);
    expect(JSON.parse(encoded as string)).toEqual(small);
  });

  it('compresses payloads above the threshold and round-trips', () => {
    const tree = bigCurriculumTree();
    const encoded = encodePayload(tree);
    expect(Buffer.isBuffer(encoded)).toBe(true);
    expect(encoded.length).toBeGreaterThan(3);
    // Round-trip via the Redis binary path.
    const decoded = decodePayload(encoded as Buffer);
    expect(decoded).toEqual(tree);
  });

  it('round-trips values through the memory-store (base64) path', () => {
    const tree = bigCurriculumTree(500);
    const encoded = encodePayload(tree);
    const stored = toStorageString(encoded);
    expect(typeof stored).toBe('string');
    expect(stored.startsWith('BRB')).toBe(true);
    const decoded = decodePayload(stored);
    expect(decoded).toEqual(tree);
  });

  it('is backward compatible with existing plain JSON cache entries', () => {
    const value = { saved: true };
    const decoded = decodePayload(JSON.stringify(value));
    expect(decoded).toEqual(value);
  });

  it('encodes large payloads to a smaller buffer than raw JSON', () => {
    const tree = bigCurriculumTree();
    const raw = Buffer.from(JSON.stringify(tree));
    const encoded = encodePayload(tree);
    expect(raw.length).toBeGreaterThan(COMPRESSION_MIN_BYTES);
    expect(encoded.length).toBeLessThan(raw.length);
  });
});

