import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildMerkleTree,
  exportProofBundle,
  getPathNodeIds,
  getProof,
  getSiblingNodeIds,
  hashLeaf,
  hashPair,
  normalizeLeaves,
  simulateTamper,
  verifyProof,
} from '../merkle-sha256';

/**
 * Independent SHA-256 references via node:crypto.
 *
 * The module hashes through Web Crypto; computing the expected values with a
 * different implementation is what proves it produces genuine SHA-256 with the
 * documented domain separation, rather than merely being self-consistent.
 */
const refLeaf = (value: string) =>
  createHash('sha256')
    .update(Buffer.concat([Buffer.from([0x00]), Buffer.from(value, 'utf8')]))
    .digest('hex');

const refPair = (left: string, right: string) =>
  createHash('sha256')
    .update(Buffer.concat([Buffer.from([0x01]), Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]))
    .digest('hex');

describe('hashing', () => {
  it('hashes a leaf as SHA-256 with the 0x00 prefix', async () => {
    const hash = await hashLeaf('alice');
    expect(hash).toBe(refLeaf('alice'));
    expect(hash).toHaveLength(64);
  });

  it('hashes a node as SHA-256 with the 0x01 prefix', async () => {
    const leaf = await hashLeaf('alice');
    expect(await hashPair(leaf, leaf)).toBe(refPair(leaf, leaf));
  });

  it('separates the leaf and node domains', async () => {
    // Without distinct prefixes an internal node's 64-byte preimage could be
    // presented as a leaf - the second-preimage attack the prefixes prevent.
    const leaf = await hashLeaf('x');
    expect(await hashPair(leaf, leaf)).not.toBe(await hashLeaf('x'));
  });
});

describe('normalizeLeaves', () => {
  it('trims, drops blanks, and de-duplicates in order', () => {
    expect(normalizeLeaves([' a ', 'a', '', '  ', 'b'])).toEqual(['a', 'b']);
  });
});

describe('buildMerkleTree', () => {
  it('returns null for no leaves', async () => {
    expect(await buildMerkleTree([])).toBeNull();
  });

  it('builds a root matching an independent computation', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    const leaves = ['alice', 'bob', 'carol', 'dave'].map(refLeaf);

    expect(tree!.root.hash).toBe(refPair(refPair(leaves[0], leaves[1]), refPair(leaves[2], leaves[3])));
    expect(tree!.depth).toBe(2);
    expect(tree!.levels.map((l) => l.length)).toEqual([4, 2, 1]);
  });

  it('treats a single leaf as its own root', async () => {
    const tree = await buildMerkleTree(['solo']);
    expect(tree!.root.hash).toBe(refLeaf('solo'));
    expect(getProof(tree!, 0)).toEqual([]);
  });

  it('promotes an unpaired node rather than duplicating it', async () => {
    const tree = await buildMerkleTree(['a', 'b', 'c']);
    const [la, lb, lc] = ['a', 'b', 'c'].map(refLeaf);

    // Duplicating the odd node - the Bitcoin construction - admits
    // CVE-2012-2459, where two distinct trees share a root.
    expect(tree!.root.hash).toBe(refPair(refPair(la, lb), lc));
    expect(tree!.root.hash).not.toBe(refPair(refPair(la, lb), refPair(lc, lc)));
  });
});

describe('proofs', () => {
  it('verifies every leaf in a power-of-two tree', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);

    for (let i = 0; i < 4; i += 1) {
      const proof = getProof(tree!, i);
      expect(proof).toHaveLength(2);

      const result = await verifyProof(tree!.leaves[i], proof, tree!.root.hash);
      expect(result.valid).toBe(true);
      expect(result.computedRoot).toBe(tree!.root.hash);
      expect(result.steps).toHaveLength(2);
    }
  });

  it('verifies every leaf when the count is not a power of two', async () => {
    const values = Array.from({ length: 17 }, (_, i) => `user${i}`);
    const tree = await buildMerkleTree(values);

    for (let i = 0; i < values.length; i += 1) {
      const result = await verifyProof(tree!.leaves[i], getProof(tree!, i), tree!.root.hash);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects a leaf that is not in the tree', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    const result = await verifyProof('mallory', getProof(tree!, 0), tree!.root.hash);
    expect(result.valid).toBe(false);
  });

  it('records each combination so the walk can be animated', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    const result = await verifyProof(tree!.leaves[0], getProof(tree!, 0), tree!.root.hash);

    // Each step feeds the next - that chaining is what the animation shows.
    expect(result.steps[0].currentHash).toBe(await hashLeaf('alice'));
    expect(result.steps[1].currentHash).toBe(result.steps[0].resultHash);
    expect(result.steps[1].resultHash).toBe(tree!.root.hash);
  });

  it('returns an empty proof for an out-of-range index', async () => {
    const tree = await buildMerkleTree(['alice']);
    expect(getProof(tree!, 99)).toEqual([]);
    expect(getProof(tree!, -1)).toEqual([]);
  });
});

describe('highlighting helpers', () => {
  it('reports the path from leaf to root', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    expect(getPathNodeIds(tree!, 0)).toEqual(['L0-0', 'L1-0', 'L2-0']);
  });

  it('resolves the sibling nodes a proof consumes', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    expect(getSiblingNodeIds(tree!, getProof(tree!, 0))).toEqual(['L0-1', 'L1-1']);
  });
});

describe('tamper simulation', () => {
  it('invalidates exactly the path to the root', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    const result = await simulateTamper(tree!, 1, 'mallory');

    expect(result!.rootChanged).toBe(true);
    // Leaf, its parent, and the root - and nothing else.
    expect(result!.changedNodeIds).toHaveLength(3);
    expect(result!.changedNodeIds).not.toContain('L0-0');
    expect(result!.changedNodeIds).not.toContain('L1-1');
  });

  it('breaks proofs issued against the original root', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    const result = await simulateTamper(tree!, 1, 'mallory');

    const stale = await verifyProof('bob', getProof(tree!, 1), result!.tamperedRoot);
    expect(stale.valid).toBe(false);
  });

  it('returns null for an out-of-range leaf', async () => {
    const tree = await buildMerkleTree(['alice']);
    expect(await simulateTamper(tree!, 5, 'x')).toBeNull();
  });
});

describe('proof export', () => {
  it('produces a self-describing, verifiable test vector', async () => {
    const tree = await buildMerkleTree(['alice', 'bob', 'carol', 'dave']);
    const bundle = await exportProofBundle(tree!, 2);

    expect(bundle).toMatchObject({
      leaf: 'carol',
      leafIndex: 2,
      root: tree!.root.hash,
      algorithm: 'sha256',
      leafPrefix: '0x00',
      nodePrefix: '0x01',
    });

    // A contract cannot reproduce the proof without the prefixes, so a vector
    // that omits them is not actually a test vector.
    const replayed = await verifyProof(bundle!.leaf, bundle!.proof, bundle!.root);
    expect(replayed.valid).toBe(true);
  });

  it('returns null for an unknown leaf index', async () => {
    const tree = await buildMerkleTree(['alice']);
    expect(await exportProofBundle(tree!, 9)).toBeNull();
  });
});
