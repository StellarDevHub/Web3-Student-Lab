/**
 * consensus-simulator.ts — chain reorganisation, double-spend, and finality
 * model for the consensus simulator (Issue #1163).
 *
 * # What the simulator is trying to make concrete
 *
 * "Confirmations" and "finality" get used as if they were the same idea. They
 * are not, and the difference is the whole point of the comparison:
 *
 *   - Under **Nakamoto/PoW**, a block is never *final*. A competing branch that
 *     accumulates more work replaces it, and every already-"confirmed"
 *     transaction on the losing branch is undone. Waiting for N confirmations
 *     does not make reversal impossible — it makes it *expensive*, and the cost
 *     falls off exponentially in N. That is a probabilistic guarantee.
 *   - Under **SCP** (and BFT protocols generally), a ledger that closes is
 *     final. There is no heavier branch to lose to, because agreement happens
 *     before the ledger closes rather than being settled afterwards by
 *     accumulated work. An attacker with enough influence cannot rewrite
 *     history; they can at worst *halt* progress. Safety is preserved at the
 *     cost of liveness — the opposite trade from PoW, which always makes
 *     progress and lets safety be probabilistic.
 *
 * # Reorg depth is the observable
 *
 * The model tracks concrete branches rather than a formula, so a reorg produces
 * an actual list of transactions that were confirmed and are now not. That is
 * what a student needs to see: not "reorgs can happen", but "these three
 * payments unhappened".
 */

export type ConsensusModel = 'pow' | 'scp';

export interface SimBlock {
  id: string;
  height: number;
  /** Branch this block belongs to. */
  branch: string;
  parentId: string | null;
  /** Cumulative work on this branch up to and including this block. */
  cumulativeWork: number;
  minedAtTick: number;
  /** Transaction ids included in this block. */
  txIds: string[];
  /** Cosmetic only — a real hash would need the whole header. */
  hash: string;
}

export interface SimTransaction {
  id: string;
  label: string;
  amount: number;
  /** Marks the two halves of a double-spend attempt. */
  doubleSpendRole?: 'honest' | 'attacker';
}

export interface ChainState {
  model: ConsensusModel;
  tick: number;
  blocks: SimBlock[];
  /** Branch id currently considered canonical. */
  canonicalBranch: string;
  /** Height at which the branches diverged, if a fork exists. */
  forkHeight: number | null;
  events: SimEvent[];
}

export interface SimEvent {
  tick: number;
  kind: 'block' | 'fork' | 'reorg' | 'finalized' | 'halt' | 'double-spend';
  message: string;
  /** Blocks removed from the canonical chain, for a reorg. */
  orphanedBlockIds?: string[];
  /** Transactions that were confirmed and are no longer, for a reorg. */
  revertedTxIds?: string[];
  depth?: number;
}

/** Stellar closes a ledger about every 5 seconds; Bitcoin averages 600. */
export const BLOCK_TIME_SECONDS: Record<ConsensusModel, number> = {
  pow: 600,
  scp: 5,
};

function makeHash(seed: string): string {
  // Deterministic, readable, and explicitly not a real hash — labelling it as
  // cosmetic is better than implying the simulator does proof-of-work.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createChain(model: ConsensusModel): ChainState {
  const genesis: SimBlock = {
    id: 'genesis',
    height: 0,
    branch: 'main',
    parentId: null,
    cumulativeWork: 0,
    minedAtTick: 0,
    txIds: [],
    hash: makeHash('genesis'),
  };

  return {
    model,
    tick: 0,
    blocks: [genesis],
    canonicalBranch: 'main',
    forkHeight: null,
    events: [],
  };
}

/** Blocks on `branch`, oldest first. Genesis belongs to every branch. */
export function branchBlocks(state: ChainState, branch: string): SimBlock[] {
  return state.blocks
    .filter((b) => b.branch === branch || b.id === 'genesis')
    .sort((a, b) => a.height - b.height);
}

/** The chain a node would currently consider canonical. */
export function canonicalChain(state: ChainState): SimBlock[] {
  return branchBlocks(state, state.canonicalBranch);
}

export function tipOf(state: ChainState, branch: string): SimBlock {
  const blocks = branchBlocks(state, branch);
  return blocks[blocks.length - 1];
}

/** Total work on a branch — the quantity PoW fork choice actually compares. */
export function branchWork(state: ChainState, branch: string): number {
  return tipOf(state, branch).cumulativeWork;
}

/** Distinct branch ids present in the chain, excluding the genesis-only case. */
export function branches(state: ChainState): string[] {
  return Array.from(new Set(state.blocks.map((b) => b.branch))).filter((b) => b !== 'genesis');
}

/**
 * Confirmation depth of a transaction on the canonical chain.
 *
 * `0` means unconfirmed; `1` means it is in the tip block. Returns `null` when
 * the transaction is not on the canonical chain at all — which is exactly the
 * state a double-spend victim finds themselves in after a reorg.
 */
export function confirmationDepth(state: ChainState, txId: string): number | null {
  const chain = canonicalChain(state);
  const index = chain.findIndex((b) => b.txIds.includes(txId));
  if (index === -1) return null;
  return chain.length - index;
}

/**
 * Probability that an attacker controlling `hashPower` of the network can
 * still reverse a transaction buried `depth` blocks deep.
 *
 * The Nakamoto gambler's-ruin result: with q < 0.5 the attacker must catch up
 * from `depth` blocks behind, and the chance of ever doing so is (q/p)^depth.
 * At q >= 0.5 it is 1 — given enough time the attacker always catches up, which
 * is what "51% attack" means and why no confirmation count is sufficient.
 */
export function reversalProbability(hashPower: number, depth: number): number {
  const q = Math.min(Math.max(hashPower, 0), 1);
  if (q >= 0.5) return 1;
  if (depth <= 0) return 1;
  return (q / (1 - q)) ** depth;
}

/**
 * Confirmations needed to push reversal risk below `target`.
 *
 * Returns `Infinity` at or above 50% hash power — no finite number of
 * confirmations makes the chain safe, which is the point being taught.
 */
export function confirmationsForRisk(hashPower: number, target = 0.001): number {
  const q = Math.min(Math.max(hashPower, 0), 1);
  if (q >= 0.5) return Infinity;
  if (q <= 0) return 1;
  return Math.ceil(Math.log(target) / Math.log(q / (1 - q)));
}

export interface MineOptions {
  branch?: string;
  txIds?: string[];
  /** Work contributed by this block. Defaults to 1 unit. */
  work?: number;
}

/**
 * Append a block, then apply the fork-choice rule for the model.
 *
 * This is where the two consensus families visibly diverge: under PoW the
 * canonical branch is recomputed from accumulated work after every block, and
 * may change. Under SCP a closed ledger is final, so the canonical branch never
 * moves — a competing branch simply cannot be adopted.
 */
export function mineBlock(state: ChainState, options: MineOptions = {}): ChainState {
  const branch = options.branch ?? state.canonicalBranch;
  const parent = parentForBranch(state, branch);
  const tick = state.tick + 1;

  const block: SimBlock = {
    id: `${branch}-${parent.height + 1}`,
    height: parent.height + 1,
    branch,
    parentId: parent.id,
    cumulativeWork: parent.cumulativeWork + (options.work ?? 1),
    minedAtTick: tick,
    txIds: options.txIds ?? [],
    hash: makeHash(`${branch}:${parent.height + 1}:${parent.hash}`),
  };

  const events: SimEvent[] = [
    {
      tick,
      kind: 'block',
      message: `Block ${block.height} produced on branch "${branch}"`,
    },
  ];

  const blocks = [...state.blocks, block];
  const next: ChainState = { ...state, tick, blocks, events: [...state.events, ...events] };

  if (state.model === 'scp') {
    // A closed ledger is final. A competing branch can exist in the model, but
    // it is never adopted, so nothing already confirmed is ever undone.
    if (branch !== state.canonicalBranch) {
      next.events.push({
        tick,
        kind: 'finalized',
        message:
          `Branch "${branch}" cannot replace the canonical chain: ledger ${parent.height} is already ` +
          'final under SCP. Validators would halt rather than accept a conflicting history.',
      });
    } else {
      next.events.push({
        tick,
        kind: 'finalized',
        message: `Ledger ${block.height} closed and is final — no reorg can revert it.`,
      });
    }
    return next;
  }

  // PoW: recompute fork choice by cumulative work.
  return applyForkChoice(next, tick);
}

/**
 * PoW fork choice: adopt whichever branch carries the most work.
 *
 * When that changes the canonical branch, the blocks that were canonical become
 * orphans and their transactions return to unconfirmed. The reverted list is
 * the thing worth showing — it is the concrete cost of probabilistic finality.
 */
function applyForkChoice(state: ChainState, tick: number): ChainState {
  const candidates = branches(state);
  if (candidates.length <= 1) return state;

  const heaviest = candidates.reduce((best, branch) =>
    branchWork(state, branch) > branchWork(state, best) ? branch : best
  );

  if (heaviest === state.canonicalBranch) return state;

  const previousChain = canonicalChain(state);
  const newChain = branchBlocks(state, heaviest);

  const forkHeight = state.forkHeight ?? 0;
  const orphaned = previousChain.filter((b) => b.height > forkHeight);
  const adopted = newChain.filter((b) => b.height > forkHeight);

  const adoptedTxIds = new Set(adopted.flatMap((b) => b.txIds));
  // A transaction present on both branches was not reverted — only those that
  // exist solely on the abandoned branch actually unhappen.
  const revertedTxIds = orphaned.flatMap((b) => b.txIds).filter((id) => !adoptedTxIds.has(id));

  return {
    ...state,
    canonicalBranch: heaviest,
    events: [
      ...state.events,
      {
        tick,
        kind: 'reorg',
        depth: orphaned.length,
        orphanedBlockIds: orphaned.map((b) => b.id),
        revertedTxIds,
        message:
          `Reorg ${orphaned.length} block${orphaned.length === 1 ? '' : 's'} deep: branch ` +
          `"${heaviest}" carries more work. ${revertedTxIds.length} previously confirmed ` +
          `transaction${revertedTxIds.length === 1 ? '' : 's'} reverted.`,
      },
    ],
  };
}

/**
 * Parent block for the next block on `branch`.
 *
 * A branch that has not produced a block yet builds on the canonical block at
 * the fork height — not on genesis, and not on the canonical tip. Getting this
 * wrong is what makes a "fork" silently behave as an extension: if the new
 * branch starts above the tip it can never replace anything, and no reorg is
 * possible however much work it accumulates.
 */
function parentForBranch(state: ChainState, branch: string): SimBlock {
  const own = state.blocks.filter((b) => b.branch === branch);
  if (own.length > 0) {
    return own.reduce((best, b) => (b.height > best.height ? b : best));
  }

  const forkHeight = state.forkHeight ?? 0;
  const canonical = canonicalChain(state);
  return canonical.find((b) => b.height === forkHeight) ?? canonical[0];
}

/**
 * Open a competing branch.
 *
 * `forkAtHeight` is the last block the two branches share. It defaults to one
 * below the current tip, so the new branch actually competes for a block that
 * already exists — forking at the tip would produce a branch that only extends
 * the chain and can never cause a reorg.
 */
export function forkChain(state: ChainState, branchName: string, forkAtHeight?: number): ChainState {
  const tip = tipOf(state, state.canonicalBranch);
  const height = Math.max(0, forkAtHeight ?? tip.height - 1);

  return {
    ...state,
    forkHeight: height,
    events: [
      ...state.events,
      {
        tick: state.tick,
        kind: 'fork',
        message:
          state.model === 'scp'
            ? `Competing branch "${branchName}" created at ledger ${height}. Under SCP this cannot win — it can only stall consensus.`
            : `Fork at height ${height}: branch "${branchName}" now competes with "${state.canonicalBranch}" for blocks ${height + 1} onward.`,
      },
    ],
  };
}

export interface DoubleSpendScenario {
  /** Attacker's share of hash power, 0..1. */
  hashPower: number;
  /** Confirmations the merchant waits for before releasing goods. */
  merchantConfirmations: number;
  amount: number;
}

export interface DoubleSpendOutcome {
  succeeded: boolean;
  model: ConsensusModel;
  reversalProbability: number;
  confirmationsForSafety: number;
  finalState: ChainState;
  narrative: string[];
}

/**
 * Run the classic double-spend: pay the merchant on the public chain, mine a
 * conflicting payment privately, then release the private branch.
 *
 * Under PoW with majority hash power the private branch overtakes and the
 * merchant's payment is reverted — after they shipped. Under SCP the same
 * sequence cannot even be attempted: the ledger containing the payment is final
 * before the attacker's branch exists.
 */
export function simulateDoubleSpend(
  model: ConsensusModel,
  scenario: DoubleSpendScenario
): DoubleSpendOutcome {
  const { hashPower, merchantConfirmations, amount } = scenario;
  const narrative: string[] = [];

  let state = createChain(model);
  const honestTx = 'tx-honest';
  const attackerTx = 'tx-attacker';

  // The attacker pays the merchant on the public chain.
  state = mineBlock(state, { txIds: [honestTx] });
  narrative.push(`Attacker pays the merchant ${amount} on the public chain (block 1).`);

  // The merchant waits for their confirmations.
  for (let i = 1; i < merchantConfirmations; i += 1) {
    state = mineBlock(state);
  }
  narrative.push(
    `Merchant waits ${merchantConfirmations} confirmation${merchantConfirmations === 1 ? '' : 's'} and ships the goods.`
  );

  if (model === 'scp') {
    narrative.push(
      'Under SCP the ledger holding that payment closed and is final. There is no heavier ' +
        'branch to switch to, so the payment cannot be reverted at any confirmation count.'
    );
    narrative.push(
      'An attacker with enough influence can stall the network — validators halt rather than ' +
        'diverge — but halting is a liveness failure, not a reversal.'
    );

    return {
      succeeded: false,
      model,
      reversalProbability: 0,
      confirmationsForSafety: 1,
      finalState: state,
      narrative,
    };
  }

  // Attacker builds privately from *below* the block containing the payment —
  // forking above it could never remove it, which is the whole objective.
  state = forkChain(state, 'attacker', 0);
  narrative.push(
    `Attacker mines privately from the fork point with ${(hashPower * 100).toFixed(0)}% of hash power, ` +
      'including a conflicting transaction that pays themselves.'
  );

  const publicHeight = tipOf(state, state.canonicalBranch).height;
  const forkHeight = state.forkHeight ?? 0;
  const blocksNeeded = publicHeight - forkHeight + 1;

  // With majority hash power the attacker outpaces the public chain and can
  // always produce a heavier branch; below 50% this is the optimistic case.
  const attackerWork = hashPower >= 0.5 ? 2 : 1;

  for (let i = 0; i < blocksNeeded; i += 1) {
    state = mineBlock(state, {
      branch: 'attacker',
      txIds: i === 0 ? [attackerTx] : [],
      work: attackerWork,
    });
  }

  const reverted = confirmationDepth(state, honestTx) === null;
  const probability = reversalProbability(hashPower, merchantConfirmations);

  narrative.push(
    reverted
      ? `Attacker releases the private branch. It carries more work, so nodes switch to it — the ` +
        `merchant's payment is gone, and the goods have already shipped.`
      : `Attacker releases the private branch, but it does not out-weigh the public chain. The ` +
        `payment stands.`
  );
  narrative.push(
    hashPower >= 0.5
      ? 'At 50% or more hash power this succeeds regardless of how long the merchant waits — no confirmation count is safe.'
      : `At ${(hashPower * 100).toFixed(0)}% hash power the chance of reversing ${merchantConfirmations} ` +
        `confirmations is about ${(probability * 100).toFixed(4)}%.`
  );

  return {
    succeeded: reverted,
    model,
    reversalProbability: probability,
    confirmationsForSafety: confirmationsForRisk(hashPower),
    finalState: state,
    narrative,
  };
}

/**
 * Chain state as it stood at `tick`, for the timeline scrubber.
 *
 * Rebuilt by replaying rather than snapshotting every tick: the history is
 * small, and replaying guarantees the scrubbed view and the live view are
 * produced by the same code path.
 */
export function stateAtTick(state: ChainState, tick: number): ChainState {
  const blocks = state.blocks.filter((b) => b.minedAtTick <= tick);
  const events = state.events.filter((e) => e.tick <= tick);

  // Fork choice as it stood then, so scrubbing back before a reorg shows the
  // chain the network actually believed at that moment.
  const present = Array.from(new Set(blocks.map((b) => b.branch))).filter((b) => b !== 'genesis');
  let canonical = state.canonicalBranch;

  if (state.model === 'pow' && present.length > 0) {
    const at = { ...state, blocks };
    canonical = present.reduce((best, branch) =>
      branchWork(at, branch) > branchWork(at, best) ? branch : best
    );
  }

  return { ...state, tick, blocks, events, canonicalBranch: canonical };
}
