/**
 * merkleTree.ts — Merkle tree, inclusion proofs and Soroban call formatting
 * for the SC-044 airdrop distributor (FE-081).
 *
 * # This is the contract's scheme, byte for byte
 *
 * `contracts/smart_vault/src/merkle_distributor.rs` fixes two things, and this
 * module reproduces both exactly so a proof generated here is accepted by
 * `claim_airdrop` / `verify_airdrop_proof`:
 *
 * - **Leaf**: `sha256(index_u32_BE ‖ ScVal(Address) XDR ‖ amount_i128_BE)`.
 *   The index is 4 raw big-endian bytes, the account is the XDR of the
 *   `ScVal::Address` (what `Address::to_xdr` yields), and the amount is the
 *   16 raw big-endian bytes of the i128 — *not* its XDR.
 * - **Parent**: `sha256(min(a, b) ‖ max(a, b))` — the two 32-byte children are
 *   ordered lexicographically before hashing, so a proof carries no left/right
 *   flags, only sibling hashes.
 *
 * The contract does not dictate how the *tree* is laid out, only how a proof is
 * checked. The builder here fixes the convention an admin needs to produce a
 * root the contract will accept: leaves are taken in claim-index order, each
 * level pairs neighbours, and an unpaired node is promoted unchanged to the next
 * level (it contributes no proof step). Promotion, not duplication, avoids the
 * CVE-2012-2459 ambiguity.
 *
 * Note `utils/merkle.ts` (used by the airdrop dashboard) is a different, older
 * construction: it omits the index and hashes the amount's XDR, so its roots and
 * proofs do not verify against the contract. Use this module for anything that
 * will be submitted on-chain.
 */

import { Address, Contract, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';

// ── Types ────────────────────────────────────────────────────────────────────

/** One airdrop entitlement: `index` is the claimant's slot in the claimed bitmap. */
export interface AirdropClaim {
  index: number;
  account: string;
  /** Raw token units (an i128 on-chain). */
  amount: bigint;
}

export interface ClaimLeaf extends AirdropClaim {
  /** Hex of the 32-byte leaf hash. */
  hash: string;
  /** The three fields that are concatenated and hashed, as hex, for inspection. */
  parts: { index: string; account: string; amount: string };
}

export interface AirdropNode {
  id: string;
  hash: string;
  level: number;
  index: number;
  isLeaf: boolean;
  /** Set on leaves only. */
  claim?: ClaimLeaf;
  /** Children. A promoted node has a single child (`left`) — the node it was carried up from. */
  left?: AirdropNode;
  right?: AirdropNode;
  /** True when the node was carried up unpaired and so has the same hash as its child. */
  promoted?: boolean;
  /** The two child hashes in the order the contract hashes them (smaller first). */
  ordered?: [string, string];
}

export interface AirdropTree {
  root: AirdropNode;
  /** `levels[0]` is the leaf row; the last entry holds the root alone. */
  levels: AirdropNode[][];
  claims: ClaimLeaf[];
  depth: number;
}

export interface ProofStep {
  /** Sibling hash, hex. This is the only thing the contract receives. */
  hash: string;
  /** Level the sibling lives at; 0 is the leaf row. */
  level: number;
  /** Sibling's index within its level, for highlighting. */
  index: number;
  /** Which side the sibling sits on in the diagram. The contract ignores it. */
  position: 'left' | 'right';
}

export interface VerificationStep {
  stepNumber: number;
  /** Hash carried into this step. */
  currentHash: string;
  siblingHash: string;
  /** The pair in the order it is hashed: the smaller hash first. */
  first: string;
  second: string;
  /** `first ‖ second`, the exact 64 bytes fed to SHA-256, as hex. */
  preimage: string;
  /** Which of the two was smaller — i.e. whether the carried hash went first. */
  currentIsFirst: boolean;
  resultHash: string;
  /** Node on the honest path this step lands on, when a tree is supplied. */
  treeNodeId?: string;
  /** Whether `resultHash` equals the tree's hash at that node. */
  matchesTree?: boolean;
}

/** What the contract would do with this claim. Codes are `DistributorError`. */
export type ContractOutcome =
  { status: 'Ok' } | { status: 'ZeroAmount'; code: 407 } | { status: 'InvalidProof'; code: 404 };

export interface ClaimVerification {
  valid: boolean;
  outcome: ContractOutcome;
  leafHash: string;
  /** Node id of the leaf on the honest path, when a tree is supplied. */
  leafNodeId?: string;
  leafMatchesTree?: boolean;
  steps: VerificationStep[];
  computedRoot: string;
  expectedRoot: string;
}

export interface ClaimSubmission {
  functionName: 'claim_airdrop';
  /** Named arguments, in contract order, as JSON-safe values. */
  args: { index: number; account: string; amount: string; proof: string[] };
  /** Each argument as a base64 `ScVal` XDR, ready for a transaction builder. */
  scVals: { index: string; account: string; amount: string; proof: string };
  /** `stellar contract invoke` command for the claim. */
  cli: string;
  /** Same arguments for the read-only `verify_airdrop_proof`, plus the root. */
  verifyCli: string;
}

// ── Hex / byte helpers ───────────────────────────────────────────────────────

const HASH_HEX_LENGTH = 64;
const U32_MAX = 0xffffffff;
const SHIFT_8 = BigInt(8);
const MASK_8 = BigInt(255);
const I128_MAX = (BigInt(1) << BigInt(127)) - BigInt(1);

export function bytesToHex(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/^0x/, '');
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new Error('Not a valid hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function isHash(hex: string): boolean {
  return hex.length === HASH_HEX_LENGTH && /^[0-9a-f]+$/.test(hex);
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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

/** Big-endian 4 bytes, as Rust's `u32::to_be_bytes`. */
export function u32ToBytesBE(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
    throw new Error('Index must be an integer between 0 and 4294967295');
  }
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

/** Big-endian 16 bytes (two's complement), as Rust's `i128::to_be_bytes`. */
export function i128ToBytesBE(value: bigint): Uint8Array {
  if (value > I128_MAX || value < -I128_MAX - BigInt(1)) {
    throw new Error('Amount does not fit in an i128');
  }
  let rest = BigInt.asUintN(128, value);
  const out = new Uint8Array(16);
  for (let i = 15; i >= 0; i -= 1) {
    out[i] = Number(rest & MASK_8);
    rest >>= SHIFT_8;
  }
  return out;
}

/** True for a Stellar account (`G…`) or contract (`C…`) address. */
export function isValidAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address);
}

/** `Address::to_xdr`: the XDR of the `ScVal::Address`. */
function addressXdr(account: string): Uint8Array {
  if (!isValidAddress(account)) throw new Error(`Not a valid Stellar address: ${account}`);
  return Uint8Array.from(Address.fromString(account).toScVal().toXDR());
}

// ── Leaf and parent hashing ──────────────────────────────────────────────────

/** Leaf hash plus the pieces it was built from. */
export async function computeLeaf(claim: AirdropClaim): Promise<ClaimLeaf> {
  const index = u32ToBytesBE(claim.index);
  const account = addressXdr(claim.account);
  const amount = i128ToBytesBE(claim.amount);
  return {
    ...claim,
    hash: await sha256Hex(concatBytes(index, account, amount)),
    parts: { index: bytesToHex(index), account: bytesToHex(account), amount: bytesToHex(amount) },
  };
}

/**
 * The pair in hashing order. Hex of equal length and case compares exactly as
 * the contract's `[u8; 32]` comparison does. On a tie the contract takes its
 * `else` branch (`sibling ‖ current`); the bytes are identical either way.
 */
export function orderPair(current: string, sibling: string): [string, string] {
  return current < sibling ? [current, sibling] : [sibling, current];
}

/** `sha256(min ‖ max)` — an internal node. */
export async function hashPair(a: string, b: string): Promise<string> {
  const [first, second] = orderPair(a, b);
  return sha256Hex(concatBytes(hexToBytes(first), hexToBytes(second)));
}

// ── Tree ─────────────────────────────────────────────────────────────────────

/**
 * Build the tree over claims in the order given. Claim `index` values must be
 * unique, and amounts positive (the contract rejects a zero amount, so such a
 * leaf could never be claimed).
 */
export async function buildAirdropTree(claims: AirdropClaim[]): Promise<AirdropTree> {
  if (claims.length === 0) throw new Error('Add at least one claim');

  const seen = new Set<number>();
  for (const claim of claims) {
    if (seen.has(claim.index)) throw new Error(`Duplicate claim index ${claim.index}`);
    seen.add(claim.index);
    if (claim.amount <= BigInt(0)) {
      throw new Error(`Claim ${claim.index} has a non-positive amount; the contract rejects it`);
    }
  }

  const leafRow = await Promise.all(claims.map((claim) => computeLeaf(claim)));
  let level: AirdropNode[] = leafRow.map((leaf, i) => ({
    id: `L0-${i}`,
    hash: leaf.hash,
    level: 0,
    index: i,
    isLeaf: true,
    claim: leaf,
  }));
  const levels: AirdropNode[][] = [level];

  while (level.length > 1) {
    const levelNumber = levels.length;
    const next: AirdropNode[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      const id = `L${levelNumber}-${next.length}`;

      if (!right) {
        // Promote unchanged: same hash, no proof step at this level.
        next.push({
          id,
          hash: left.hash,
          level: levelNumber,
          index: next.length,
          isLeaf: false,
          left,
          promoted: true,
        });
        continue;
      }

      const ordered = orderPair(left.hash, right.hash);
      next.push({
        id,
        // eslint-disable-next-line no-await-in-loop
        hash: await hashPair(left.hash, right.hash),
        level: levelNumber,
        index: next.length,
        isLeaf: false,
        left,
        right,
        ordered,
      });
    }

    levels.push(next);
    level = next;
  }

  return { root: level[0], levels, claims: leafRow, depth: levels.length - 1 };
}

/**
 * Sibling hashes needed to rebuild the root from a leaf. A promoted node has no
 * sibling at that level, so a leaf on an odd edge has a shorter proof.
 */
export function getProof(tree: AirdropTree, leafIndex: number): ProofStep[] {
  if (leafIndex < 0 || leafIndex >= tree.levels[0].length) return [];

  const steps: ProofStep[] = [];
  let index = leafIndex;

  for (let level = 0; level < tree.levels.length - 1; level += 1) {
    const nodes = tree.levels[level];
    const isRightChild = index % 2 === 1;
    const siblingIndex = isRightChild ? index - 1 : index + 1;
    const sibling = nodes[siblingIndex];

    if (sibling) {
      steps.push({
        hash: sibling.hash,
        level,
        index: siblingIndex,
        position: isRightChild ? 'left' : 'right',
      });
    }
    index = Math.floor(index / 2);
  }

  return steps;
}

/** Node on the leaf-to-root path at each level (promoted nodes included). */
export function getPathNodes(tree: AirdropTree, leafIndex: number): AirdropNode[] {
  const nodes: AirdropNode[] = [];
  let index = leafIndex;
  for (let level = 0; level < tree.levels.length; level += 1) {
    const node = tree.levels[level][index];
    if (node) nodes.push(node);
    index = Math.floor(index / 2);
  }
  return nodes;
}

export function getPathNodeIds(tree: AirdropTree, leafIndex: number): string[] {
  return getPathNodes(tree, leafIndex).map((n) => n.id);
}

export function getSiblingNodeIds(tree: AirdropTree, proof: ProofStep[]): string[] {
  return proof
    .map((step) => tree.levels[step.level]?.[step.index]?.id)
    .filter((id): id is string => Boolean(id));
}

// ── Verification (mirrors `claim` / `verify_proof`) ──────────────────────────

/**
 * Replay a claim the way the contract does and record every step.
 *
 * Mirrors the order of checks in `MerkleDistributor::claim` that can be decided
 * off-chain: a non-positive amount is `ZeroAmount` before any hashing; otherwise
 * the leaf is hashed, folded up the proof, and compared with the root. The
 * on-chain-only checks — the claimed bitmap (`AlreadyClaimed`) and the pause
 * switch — need contract state and are not modelled here.
 *
 * Passing `against` annotates each step with whether it matches the honest tree
 * path of `leafPosition`, which is what drives the green/red animation: once a
 * hash diverges every later step diverges too, because each parent hash depends
 * on its child. `leafPosition` is the leaf the claimant is trying to prove — it
 * is separate from `claim.index` so a spoofed index is compared against the leaf
 * it is pretending to be, not silently re-pointed at another one.
 */
export async function verifyClaim(
  claim: AirdropClaim,
  proof: ProofStep[],
  expectedRoot: string,
  against?: { tree: AirdropTree; leafPosition: number }
): Promise<ClaimVerification> {
  if (claim.amount <= BigInt(0)) {
    return {
      valid: false,
      outcome: { status: 'ZeroAmount', code: 407 },
      leafHash: '',
      steps: [],
      computedRoot: '',
      expectedRoot,
    };
  }

  const leaf = await computeLeaf(claim);
  const pathNodes = against ? getPathNodes(against.tree, against.leafPosition) : [];
  const leafNode = pathNodes[0];

  let currentHash = leaf.hash;
  const steps: VerificationStep[] = [];

  for (let i = 0; i < proof.length; i += 1) {
    const step = proof[i];
    const [first, second] = orderPair(currentHash, step.hash);
    // eslint-disable-next-line no-await-in-loop
    const resultHash = await sha256Hex(concatBytes(hexToBytes(first), hexToBytes(second)));
    const treeNode = pathNodes[step.level + 1];

    steps.push({
      stepNumber: i + 1,
      currentHash,
      siblingHash: step.hash,
      first,
      second,
      preimage: first + second,
      currentIsFirst: currentHash < step.hash,
      resultHash,
      treeNodeId: treeNode?.id,
      matchesTree: treeNode ? treeNode.hash === resultHash : undefined,
    });
    currentHash = resultHash;
  }

  const valid = currentHash === expectedRoot;
  return {
    valid,
    outcome: valid ? { status: 'Ok' } : { status: 'InvalidProof', code: 404 },
    leafHash: leaf.hash,
    leafNodeId: leafNode?.id,
    leafMatchesTree: leafNode ? leafNode.hash === leaf.hash : undefined,
    steps,
    computedRoot: currentHash,
    expectedRoot,
  };
}

// ── Soroban submission ───────────────────────────────────────────────────────

const CONTRACT_PLACEHOLDER = '<CONTRACT_ID>';

/**
 * The four `claim_airdrop` arguments as `ScVal`s, in contract order:
 * `index: u32`, `account: Address`, `amount: i128`, `proof: Vec<BytesN<32>>`.
 */
export function buildClaimScVals(claim: AirdropClaim, proof: string[]): xdr.ScVal[] {
  if (!isValidAddress(claim.account))
    throw new Error(`Not a valid Stellar address: ${claim.account}`);
  for (const hash of proof) {
    if (!isHash(hash)) throw new Error('Every proof element must be a 32-byte hex hash');
  }
  return [
    nativeToScVal(claim.index, { type: 'u32' }),
    Address.fromString(claim.account).toScVal(),
    nativeToScVal(claim.amount, { type: 'i128' }),
    xdr.ScVal.scvVec(proof.map((hash) => xdr.ScVal.scvBytes(Buffer.from(hash, 'hex')))),
  ];
}

/** A ready-to-sign `invokeHostFunction` operation calling `claim_airdrop`. */
export function buildClaimOperation(
  contractId: string,
  claim: AirdropClaim,
  proof: string[]
): xdr.Operation {
  if (!StrKey.isValidContract(contractId)) throw new Error('Not a valid contract ID');
  return new Contract(contractId).call('claim_airdrop', ...buildClaimScVals(claim, proof));
}

/** Everything a client needs to submit a claim, in the formats that are asked for. */
export function formatClaimSubmission(
  claim: AirdropClaim,
  proof: ProofStep[] | string[],
  options: { contractId?: string; root?: string } = {}
): ClaimSubmission {
  const hashes = proof.map((p) => (typeof p === 'string' ? p : p.hash));
  const [index, account, amount, proofVec] = buildClaimScVals(claim, hashes);
  const id =
    options.contractId && StrKey.isValidContract(options.contractId)
      ? options.contractId
      : CONTRACT_PLACEHOLDER;
  const proofJson = JSON.stringify(hashes);
  const argv = `--index ${claim.index} --account ${claim.account} --amount ${claim.amount.toString()} --proof '${proofJson}'`;

  return {
    functionName: 'claim_airdrop',
    args: {
      index: claim.index,
      account: claim.account,
      amount: claim.amount.toString(),
      proof: hashes,
    },
    scVals: {
      index: index.toXDR('base64'),
      account: account.toXDR('base64'),
      amount: amount.toXDR('base64'),
      proof: proofVec.toXDR('base64'),
    },
    cli: `stellar contract invoke --id ${id} --source <CLAIMANT_KEY> --network testnet -- claim_airdrop ${argv}`,
    verifyCli: `stellar contract invoke --id ${id} --source <ANY_KEY> --network testnet -- verify_airdrop_proof ${argv} --root ${options.root ?? '<MERKLE_ROOT>'}`,
  };
}

// ── Input parsing ────────────────────────────────────────────────────────────

export interface ClaimParseError {
  line: number;
  message: string;
}

export interface ParsedClaims {
  claims: AirdropClaim[];
  errors: ClaimParseError[];
}

/**
 * Parse `address, amount` lines (optionally `index, address, amount`). Without
 * an explicit index a claim takes the next free slot, in line order. `#` starts
 * a comment; blank lines are ignored. Problems are reported per line, so one bad
 * row does not hide the rest.
 */
export function parseClaimLines(text: string, maxClaims = 64): ParsedClaims {
  const claims: AirdropClaim[] = [];
  const errors: ClaimParseError[] = [];
  const usedIndices = new Set<number>();
  let nextIndex = 0;

  text.split('\n').forEach((raw, i) => {
    const line = i + 1;
    const content = raw.split('#')[0].trim();
    if (!content) return;

    const fields = content.split(/[\s,]+/).filter(Boolean);
    if (fields.length !== 2 && fields.length !== 3) {
      errors.push({ line, message: 'Expected "address, amount" or "index, address, amount"' });
      return;
    }
    if (claims.length >= maxClaims) {
      errors.push({ line, message: `At most ${maxClaims} claims are supported here` });
      return;
    }

    const [accountField, amountField] = fields.length === 3 ? [fields[1], fields[2]] : fields;
    let index: number;
    if (fields.length === 3) {
      if (!/^\d+$/.test(fields[0]) || Number(fields[0]) > U32_MAX) {
        errors.push({ line, message: 'Index must be a whole number up to 4294967295' });
        return;
      }
      index = Number(fields[0]);
    } else {
      while (usedIndices.has(nextIndex)) nextIndex += 1;
      index = nextIndex;
    }

    if (!isValidAddress(accountField)) {
      errors.push({ line, message: `Not a valid Stellar address: ${accountField}` });
      return;
    }
    if (!/^\d+$/.test(amountField)) {
      errors.push({ line, message: 'Amount must be a whole number of token units' });
      return;
    }
    const amount = BigInt(amountField);
    if (amount <= BigInt(0) || amount > I128_MAX) {
      errors.push({ line, message: 'Amount must be positive and fit in an i128' });
      return;
    }
    if (usedIndices.has(index)) {
      errors.push({ line, message: `Index ${index} is already used` });
      return;
    }

    usedIndices.add(index);
    claims.push({ index, account: accountField, amount });
  });

  return { claims, errors };
}
