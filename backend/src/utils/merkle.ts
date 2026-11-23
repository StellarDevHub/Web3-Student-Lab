export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface MerkleProofStep {
  hash: string;
  position: 'left' | 'right';
}

export function verifyMerkleProof(value: string, proof: MerkleProofStep[], rootHash: string): boolean {
  let hash = stableHash(value.trim());
  for (const step of proof) {
    hash = step.position === 'left'
      ? stableHash(`${step.hash}:${hash}`)
      : stableHash(`${hash}:${step.hash}`);
  }
  return hash === rootHash;
}
