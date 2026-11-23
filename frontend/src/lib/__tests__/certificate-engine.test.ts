import { describe, expect, it } from 'vitest';
import {
  buildVerificationUrl,
  mulberry32,
  seedFromString,
} from '@/lib/certificate-generator';

describe('certificate rendering engine', () => {
  it('produces a deterministic seed from a string', () => {
    expect(seedFromString('abc')).toBe(seedFromString('abc'));
    expect(seedFromString('abc')).not.toBe(seedFromString('abd'));
  });

  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('builds a verification URL pointing at /verify/[id]', () => {
    const url = buildVerificationUrl('CERT-42');
    expect(url).toContain('/verify/CERT-42');
  });
});
