export interface MerkleNode {
  id: string;
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  isLeaf: boolean;
  value?: string;
  level: number;
  index: number;
}

export interface MerkleProofStep {
  hash: string;
  position: 'left' | 'right';
}

export interface MerkleBuildResult {
  root: MerkleNode;
  levels: MerkleNode[][];
  leafCount: number;
  depth: number;
  duplicateLeafCount: number;
}

export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeMerkleLeaves(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildOptimizedMerkleTree(values: string[]): MerkleBuildResult {
  const leaves = normalizeMerkleLeaves(values);
  if (leaves.length === 0) {
    const root: MerkleNode = {
      id: 'root-empty',
      hash: '00000000',
      isLeaf: false,
      level: 0,
      index: 0,
    };
    return { root, levels: [[root]], leafCount: 0, depth: 0, duplicateLeafCount: 0 };
  }

  let current = leaves.map<MerkleNode>((value, index) => ({
    id: `leaf-${index}`,
    hash: stableHash(value),
    isLeaf: true,
    value,
    level: 0,
    index,
  }));
  const levels: MerkleNode[][] = [current];
  let duplicateLeafCount = 0;
  let level = 0;

  while (current.length > 1) {
    const next: MerkleNode[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1] ?? left;
      if (!current[i + 1]) duplicateLeafCount += 1;
      next.push({
        id: `node-${level + 1}-${Math.floor(i / 2)}`,
        hash: stableHash(`${left.hash}:${right.hash}`),
        left,
        right,
        isLeaf: false,
        level: level + 1,
        index: Math.floor(i / 2),
      });
    }
    current = next;
    levels.push(current);
    level += 1;
  }

  return {
    root: current[0]!,
    levels,
    leafCount: leaves.length,
    depth: levels.length - 1,
    duplicateLeafCount,
  };
}

export function getMerkleProof(result: MerkleBuildResult, value: string): MerkleProofStep[] {
  const target = value.trim().toLowerCase();
  let index = result.levels[0].findIndex((leaf) => leaf.value?.toLowerCase() === target);
  if (index < 0) return [];

  const proof: MerkleProofStep[] = [];
  for (let level = 0; level < result.levels.length - 1; level += 1) {
    const layer = result.levels[level]!;
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const sibling = layer[siblingIndex] ?? layer[index]!;
    proof.push({ hash: sibling.hash, position: isRight ? 'left' : 'right' });
    index = Math.floor(index / 2);
  }
  return proof;
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
