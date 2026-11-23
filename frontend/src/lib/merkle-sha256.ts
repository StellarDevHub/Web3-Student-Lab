/**
 * merkle-sha256.ts — SHA-256 Merkle trees, inclusion proofs, and tamper
 * simulation for the Merkle visualiser (Issue #1159).
 *
 * # Why this is not `merkle-tree-builder.ts`
 *
 * The existing builder hashes with `stableHash`, which is FNV-1a: a 32-bit,
 * non-cryptographic hash. That is fine for the airdrop demo it backs, where
 * the hash is only an identifier. It is the wrong primitive for a tool whose
 * entire lesson is cryptographic immutability — a student could find an FNV
 * collision by hand, and the tamper demo would be teaching that Merkle roots
 * are forgeable. This module uses real SHA-256 so the exported proofs are
 * valid test vectors against an actual contract.
 *
 * # Second-preimage resistance
 *
 * Leaves are hashed with a `0x00` prefix and internal nodes with `0x01`. Without
 * that domain separation an attacker can present an *internal* node's preimage
 * as if it were a leaf: the concatenation of two child hashes is 64 bytes, and
 * a tree built over 64-byte leaves would hash it identically. Prefixing makes
 * the two domains disjoint, which is the standard fix (RFC 6962 uses the same
 * construction).
 *
 * # Odd node counts
 *
 * An unpaired node is promoted to the next level rather than duplicated.
 * Duplicating it — the Bitcoin approach — admits CVE-2012-2459, where two
 * distinct trees produce the same root. Promotion has no such ambiguity, and
 * for a teaching tool the honest construction matters more than matching
 * Bitcoin's quirk.
 */

export interface MerkleNode {
  id: string;
  hash: string;
  level: number;
  index: number;
  isLeaf: boolean;
  /** Original input string; leaves only. */
  value?: string;
  left?: MerkleNode;
  right?: MerkleNode;
  /** True when the node was carried up unpaired. */
  promoted?: boolean;
}

export interface MerkleProofStep {
  hash: string;
  /** Which side the sibling sits on — determines concatenation order. */
  position: 'left' | 'right';
  /** Level the sibling lives at; 0 is the leaf row. */
  level: number;
  /** Sibling's index within its level, for highlighting in the diagram. */
  index: number;
}

export interface MerkleTree {
  root: MerkleNode;
  /** `levels[0]` is the leaf row; the last entry holds the root alone. */
  levels: MerkleNode[][];
  leaves: string[];
  depth: number;
}

/** One step of the verification walk, for the step-by-step animation. */
export interface VerificationStep {
  stepNumber: number;
  /** Hash carried into this step. */
  currentHash: string;
  /** Sibling combined at this step. */
  siblingHash: string;
  position: 'left' | 'right';
  /** Exact string fed to SHA-256, so the student can reproduce it. */
  concatenation: string;
  /** Result of this step, which becomes the next step's `currentHash`. */
  resultHash: string;
  level: number;
}

export interface VerificationResult {
  valid: boolean;
  steps: VerificationStep[];
  computedRoot: string;
  expectedRoot: string;
}

/** A proof, in the shape exported as a JSON test vector. */
export interface ProofBundle {
  leaf: string;
  leafHash: string;
  leafIndex: number;
  root: string;
  proof: MerkleProofStep[];
  algorithm: 'sha256';
  leafPrefix: '0x00';
  nodePrefix: '0x01';
}

const LEAF_PREFIX = '00';
const NODE_PREFIX = '01';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * SHA-256 via Web Crypto.
 *
 * Async because `crypto.subtle` is, which is why the whole tree API is async.
 * Bundling a synchronous SHA-256 implementation would avoid that, but at the
 * cost of shipping crypto code the platform already provides correctly.
 */
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return toHex(digest);
}

/** `SHA256(0x00 || utf8(value))` — a leaf hash. */
export async function hashLeaf(value: string): Promise<string> {
  return sha256(concatBytes(hexToBytes(LEAF_PREFIX), new TextEncoder().encode(value)));
}

/** `SHA256(0x01 || left || right)` — an internal node hash. */
export async function hashPair(left: string, right: string): Promise<string> {
  return sha256(concatBytes(hexToBytes(NODE_PREFIX), hexToBytes(left), hexToBytes(right)));
}

/** Trim, drop empties, and de-duplicate while preserving order. */
export function normalizeLeaves(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Build the tree bottom-up. Returns `null` for an empty leaf set. */
export async function buildMerkleTree(values: string[]): Promise<MerkleTree | null> {
  const leaves = normalizeLeaves(values);
  if (leaves.length === 0) return null;

  let level: MerkleNode[] = await Promise.all(
    leaves.map(async (value, index) => ({
      id: `L0-${index}`,
      hash: await hashLeaf(value),
      level: 0,
      index,
      isLeaf: true,
      value,
    }))
  );

  const levels: MerkleNode[][] = [level];

  while (level.length > 1) {
    const levelNumber = levels.length;
    const next: MerkleNode[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];

      if (!right) {
        // Promote rather than duplicate — see the module note on CVE-2012-2459.
        next.push({ ...left, id: `L${levelNumber}-${next.length}`, level: levelNumber, index: next.length, promoted: true });
        continue;
      }

      next.push({
        id: `L${levelNumber}-${next.length}`,
        // eslint-disable-next-line no-await-in-loop
        hash: await hashPair(left.hash, right.hash),
        level: levelNumber,
        index: next.length,
        isLeaf: false,
        left,
        right,
      });
    }

    levels.push(next);
    level = next;
  }

  return { root: level[0], levels, leaves, depth: levels.length - 1 };
}

/**
 * Audit path for a leaf: the sibling at each level needed to rebuild the root.
 *
 * A promoted node has no sibling at that level, so it contributes no step —
 * which is exactly why the proof for such a leaf is shorter than the tree depth.
 */
export function getProof(tree: MerkleTree, leafIndex: number): MerkleProofStep[] {
  if (leafIndex < 0 || leafIndex >= tree.levels[0].length) return [];

  const steps: MerkleProofStep[] = [];
  let index = leafIndex;

  for (let level = 0; level < tree.levels.length - 1; level += 1) {
    const nodes = tree.levels[level];
    const isRightChild = index % 2 === 1;
    const siblingIndex = isRightChild ? index - 1 : index + 1;
    const sibling = nodes[siblingIndex];

    if (sibling) {
      steps.push({
        hash: sibling.hash,
        // The sibling's side, which fixes the concatenation order on the way up.
        position: isRightChild ? 'left' : 'right',
        level,
        index: siblingIndex,
      });
    }

    index = Math.floor(index / 2);
  }

  return steps;
}

/**
 * Replay a proof, recording each step.
 *
 * The steps are the point: the student sees the exact bytes hashed at every
 * level rather than a bare pass/fail.
 */
export async function verifyProof(
  leafValue: string,
  proof: MerkleProofStep[],
  expectedRoot: string
): Promise<VerificationResult> {
  let currentHash = await hashLeaf(leafValue);
  const steps: VerificationStep[] = [];

  for (let i = 0; i < proof.length; i += 1) {
    const step = proof[i];
    const [left, right] =
      step.position === 'left' ? [step.hash, currentHash] : [currentHash, step.hash];

    // eslint-disable-next-line no-await-in-loop
    const resultHash = await hashPair(left, right);

    steps.push({
      stepNumber: i + 1,
      currentHash,
      siblingHash: step.hash,
      position: step.position,
      concatenation: `0x01 || ${left.slice(0, 8)}… || ${right.slice(0, 8)}…`,
      resultHash,
      level: step.level,
    });

    currentHash = resultHash;
  }

  return {
    valid: currentHash === expectedRoot,
    steps,
    computedRoot: currentHash,
    expectedRoot,
  };
}

/** Ids of every node on the path from a leaf to the root, for highlighting. */
export function getPathNodeIds(tree: MerkleTree, leafIndex: number): string[] {
  const ids: string[] = [];
  let index = leafIndex;

  for (let level = 0; level < tree.levels.length; level += 1) {
    const node = tree.levels[level][index];
    if (node) ids.push(node.id);
    index = Math.floor(index / 2);
  }

  return ids;
}

/** Ids of the sibling nodes a proof consumes, for highlighting. */
export function getSiblingNodeIds(tree: MerkleTree, proof: MerkleProofStep[]): string[] {
  return proof
    .map((step) => tree.levels[step.level]?.[step.index]?.id)
    .filter((id): id is string => Boolean(id));
}

export interface TamperResult {
  original: MerkleTree;
  tampered: MerkleTree;
  /** Node ids whose hash changed — the cascade up to the root. */
  changedNodeIds: string[];
  rootChanged: boolean;
  originalRoot: string;
  tamperedRoot: string;
}

/**
 * Rebuild the tree with one leaf altered and report which hashes changed.
 *
 * The cascade is the lesson: editing one leaf changes its hash, which changes
 * its parent, and so on to the root. Nothing else in the tree moves — only the
 * path — which is also why a proof is `log n` and not `n`.
 */
export async function simulateTamper(
  tree: MerkleTree,
  leafIndex: number,
  newValue: string
): Promise<TamperResult | null> {
  if (leafIndex < 0 || leafIndex >= tree.leaves.length) return null;

  const tamperedLeaves = [...tree.leaves];
  tamperedLeaves[leafIndex] = newValue;

  const tampered = await buildMerkleTree(tamperedLeaves);
  if (!tampered) return null;

  const changedNodeIds: string[] = [];
  for (let level = 0; level < tree.levels.length; level += 1) {
    const before = tree.levels[level];
    const after = tampered.levels[level];
    for (let i = 0; i < before.length; i += 1) {
      if (after[i] && before[i].hash !== after[i].hash) {
        changedNodeIds.push(before[i].id);
      }
    }
  }

  return {
    original: tree,
    tampered,
    changedNodeIds,
    rootChanged: tree.root.hash !== tampered.root.hash,
    originalRoot: tree.root.hash,
    tamperedRoot: tampered.root.hash,
  };
}

/**
 * Proof as an exportable JSON test vector.
 *
 * The prefixes are included because a contract cannot verify the proof without
 * knowing the domain-separation scheme — a vector that omits them is not
 * reproducible.
 */
export async function exportProofBundle(
  tree: MerkleTree,
  leafIndex: number
): Promise<ProofBundle | null> {
  const leaf = tree.leaves[leafIndex];
  if (leaf === undefined) return null;

  return {
    leaf,
    leafHash: tree.levels[0][leafIndex].hash,
    leafIndex,
    root: tree.root.hash,
    proof: getProof(tree, leafIndex),
    algorithm: 'sha256',
    leafPrefix: '0x00',
    nodePrefix: '0x01',
  };
}
