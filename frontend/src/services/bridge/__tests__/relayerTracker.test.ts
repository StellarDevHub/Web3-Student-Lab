import { describe, expect, it } from 'vitest';
import {
  buildDestinationExplorerUrl,
  buildSourceExplorerUrl,
  sha256PairHex,
  sha256TextHex,
  verifyMerkleInclusionProof,
} from '../relayerTracker';

describe('Cross-Chain Bridge Status Monitor & Merkle Proof Verifier (#1558)', () => {
  it('computes standard FIPS 180-4 SHA-256 hex digests without Node crypto dependencies', () => {
    expect(sha256TextHex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
  it('verifies valid Merkle inclusion proof from leaf and sibling hashes to root', () => {
    const leaf = 'aaaa1111';
    const sibling1 = 'bbbb2222';
    const sibling2 = 'cccc3333';
    const parent1 = sha256PairHex(leaf, sibling1);
    const root = sha256PairHex(sibling2, parent1);

    const proof = verifyMerkleInclusionProof(
      leaf,
      [
        { position: 'right', siblingHash: sibling1 },
        { position: 'left', siblingHash: sibling2 },
      ],
      root
    );
    expect(proof.verified).toBe(true);
    expect(proof.nodes).toHaveLength(2);
    expect(proof.nodes[0].computedParentHash).toBe(parent1);
    expect(proof.nodes[1].computedParentHash).toBe(root);
  });

  it('rejects tampered sibling hashes in Merkle proof verification', () => {
    const proof = verifyMerkleInclusionProof(
      'aaaa1111',
      [{ position: 'right', siblingHash: 'tampered9999' }],
      'deadbeef0000'
    );
    expect(proof.verified).toBe(false);
  });

  it('builds direct block explorer URLs for both Ethereum Sepolia and Stellar', () => {
    expect(buildSourceExplorerUrl('0xabc123')).toBe('https://sepolia.etherscan.io/tx/0xabc123');
    expect(buildDestinationExplorerUrl('stellar_tx_99')).toBe(
      'https://stellar.expert/explorer/testnet/tx/stellar_tx_99'
    );
  });
});
