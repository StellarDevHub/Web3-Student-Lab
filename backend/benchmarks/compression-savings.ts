/**
 * compression-savings.ts — Issue #1139
 *
 * Measures the memory savings from Brotli-compressing 1,000 (simulated) cached
 * course curriculum trees compared with storing them as raw JSON. Uses the same
 * PayloadCodec that CacheService relies on, so the number represents real
 * savings on the wire/in Redis.
 *
 * Run: npx tsx benchmarks/compression-savings.ts
 */

import { encodePayload } from '../src/cache/PayloadCodec.js';

interface Lesson {
  id: string;
  title: string;
  description: string;
  modules: Array<{ slug: string; order: number; status: string }>;
}

function buildCurriculumTree(i: number): Lesson[] {
  return Array.from({ length: 12 }, (_, l) => ({
    id: `course-${i}-lesson-${l}`,
    title: `Contrato Inteligente Avanzado — Curso #${i}, Lección #${l}`,
    description: 'A'.repeat(140),
    modules: Array.from({ length: 6 }, (_, m) => ({
      slug: `module-${i}-${l}-${m}`,
      order: m,
      status: m % 2 ? 'published' : 'draft',
    })),
  }));
}

function main(): void {
  const TOTAL = 1_000;

  let rawBytes = 0;
  let compressedBytes = 0;
  let compressedCount = 0;

  for (let i = 0; i < TOTAL; i++) {
    const tree = buildCurriculumTree(i);
    const raw = Buffer.from(JSON.stringify(tree));
    rawBytes += raw.byteLength;

    const encoded = encodePayload(tree);
    const encodedLen = Buffer.isBuffer(encoded) ? encoded.byteLength : Buffer.byteLength(encoded as string);
    compressedBytes += encodedLen;
    if (Buffer.isBuffer(encoded)) compressedCount++;
  }

  const savedBytes = rawBytes - compressedBytes;
  const savedPct = rawBytes > 0 ? (savedBytes / rawBytes) * 100 : 0;

  console.log('===== Cache Payload Compression Savings (issue #1139) =====');
  console.log(` trees cached:                ${TOTAL}`);
  console.log(` raw JSON bytes:              ${rawBytes.toLocaleString()}`);
  console.log(` compressed bytes:            ${compressedBytes.toLocaleString()}`);
  console.log(` memory saved:                ${savedBytes.toLocaleString()} bytes`);
  console.log(` savings:                     ${savedPct.toFixed(1)}%`);
  console.log(` trees compressed (>1KB):     ${compressedCount}`);
  console.log('============================================================');
}

main();