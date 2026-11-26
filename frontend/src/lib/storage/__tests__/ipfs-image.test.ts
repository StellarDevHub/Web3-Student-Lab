import { describe, expect, it } from 'vitest';
import { resolveIpfsImageSrc } from '../ipfs';

describe('resolveIpfsImageSrc', () => {
  it('rewrites CIDv0 IPFS URIs to the same-origin optimizer route', () => {
    expect(resolveIpfsImageSrc(`ipfs://QmYwAPJzv5CZsnAzt8auVTL9Y9F3ZQ3vY8kW8d9VfQ2r1x`))
      .toBe('/api/ipfs/QmYwAPJzv5CZsnAzt8auVTL9Y9F3ZQ3vY8kW8d9VfQ2r1x');
  });

  it('supports CIDv1 paths and the ipfs://ipfs/ prefix', () => {
    expect(resolveIpfsImageSrc('ipfs://ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3k5wq6h5z2m7z4j2v5x6y7z3a/thumb.png'))
      .toBe('/api/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3k5wq6h5z2m7z4j2v5x6y7z3a/thumb.png');
  });

  it('leaves ordinary URLs unchanged', () => {
    expect(resolveIpfsImageSrc('https://images.example.com/photo.webp'))
      .toBe('https://images.example.com/photo.webp');
  });

  it('rejects malformed CIDs and path traversal', () => {
    expect(resolveIpfsImageSrc('ipfs://not-a-cid/image.png')).toBe('');
    expect(resolveIpfsImageSrc('ipfs://QmYwAPJzv5CZsnAzt8auVTL9Y9F3ZQ3vY8kW8d9VfQ2r1x/../secret')).toBe('');
  });
});
