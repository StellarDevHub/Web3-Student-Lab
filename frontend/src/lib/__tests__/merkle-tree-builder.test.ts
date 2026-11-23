import { describe, expect, it } from 'vitest';
import {
  buildOptimizedMerkleTree,
  getMerkleProof,
  normalizeMerkleLeaves,
  verifyMerkleProof,
} from '../merkle-tree-builder';

describe('optimized Merkle tree builder', () => {
  it('normalizes blank and duplicate leaves', () => {
    expect(normalizeMerkleLeaves([' alice ', '', 'ALICE', 'bob'])).toEqual(['alice', 'bob']);
  });

  it('builds a deterministic tree with proof verification', () => {
    const tree = buildOptimizedMerkleTree(['alice', 'bob', 'carol', 'drew']);
    const proof = getMerkleProof(tree, 'carol');

    expect(tree.root.hash).toHaveLength(8);
    expect(tree.leafCount).toBe(4);
    expect(tree.depth).toBe(2);
    expect(verifyMerkleProof('carol', proof, tree.root.hash)).toBe(true);
    expect(verifyMerkleProof('mallory', proof, tree.root.hash)).toBe(false);
  });

  it('duplicates the last leaf for odd layers', () => {
    const tree = buildOptimizedMerkleTree(['alice', 'bob', 'carol']);

    expect(tree.duplicateLeafCount).toBe(1);
    expect(getMerkleProof(tree, 'carol')).toHaveLength(2);
  });
});
