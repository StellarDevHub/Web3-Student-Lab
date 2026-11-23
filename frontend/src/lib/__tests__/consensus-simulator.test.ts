import { describe, expect, it } from 'vitest';

import {
  branchWork,
  canonicalChain,
  confirmationDepth,
  confirmationsForRisk,
  createChain,
  forkChain,
  mineBlock,
  reversalProbability,
  simulateDoubleSpend,
  stateAtTick,
  tipOf,
} from '../consensus-simulator';

describe('chain construction', () => {
  it('starts at genesis', () => {
    const chain = createChain('pow');
    expect(chain.blocks).toHaveLength(1);
    expect(canonicalChain(chain)).toHaveLength(1);
  });

  it('advances the tip and accumulates work', () => {
    let chain = createChain('pow');
    chain = mineBlock(chain, { txIds: ['tx1'] });
    chain = mineBlock(chain);

    expect(tipOf(chain, 'main').height).toBe(2);
    expect(branchWork(chain, 'main')).toBe(2);
    expect(confirmationDepth(chain, 'tx1')).toBe(2);
  });

  it('reports no depth for a transaction that is not on the chain', () => {
    expect(confirmationDepth(createChain('pow'), 'missing')).toBeNull();
  });
});

describe('proof-of-work fork choice', () => {
  it('keeps the canonical chain when the competing branch is lighter', () => {
    let chain = createChain('pow');
    chain = mineBlock(chain, { txIds: ['tx1'] });
    chain = mineBlock(chain);
    chain = forkChain(chain, 'attacker', 0);
    chain = mineBlock(chain, { branch: 'attacker' });

    expect(chain.canonicalBranch).toBe('main');
    expect(confirmationDepth(chain, 'tx1')).toBe(2);
  });

  it('reorgs to the heavier branch and reverts its transactions', () => {
    let chain = createChain('pow');
    chain = mineBlock(chain, { txIds: ['tx1'] });
    chain = mineBlock(chain);
    // Fork below the block holding tx1 - forking above it could never remove it.
    chain = forkChain(chain, 'attacker', 0);
    chain = mineBlock(chain, { branch: 'attacker', work: 5 });
    chain = mineBlock(chain, { branch: 'attacker', work: 5 });

    const reorg = chain.events.filter((e) => e.kind === 'reorg').pop();

    expect(chain.canonicalBranch).toBe('attacker');
    expect(reorg?.depth).toBe(2);
    expect(reorg?.revertedTxIds).toContain('tx1');
    // The concrete consequence: a confirmed payment is now unconfirmed.
    expect(confirmationDepth(chain, 'tx1')).toBeNull();
  });

  it('does not count a transaction present on both branches as reverted', () => {
    let chain = createChain('pow');
    chain = mineBlock(chain, { txIds: ['shared'] });
    chain = forkChain(chain, 'b2', 0);
    chain = mineBlock(chain, { branch: 'b2', txIds: ['shared'], work: 9 });

    const reorg = chain.events.filter((e) => e.kind === 'reorg').pop();
    expect(reorg?.revertedTxIds ?? []).not.toContain('shared');
  });
});

describe('SCP finality', () => {
  it('never adopts a competing branch, however much work it carries', () => {
    let chain = createChain('scp');
    chain = mineBlock(chain, { txIds: ['pay'] });
    chain = forkChain(chain, 'attacker', 0);
    chain = mineBlock(chain, { branch: 'attacker', work: 100 });
    chain = mineBlock(chain, { branch: 'attacker', work: 100 });

    expect(chain.canonicalBranch).toBe('main');
    expect(confirmationDepth(chain, 'pay')).not.toBeNull();
    expect(chain.events.some((e) => e.kind === 'reorg')).toBe(false);
    expect(chain.events.some((e) => e.kind === 'finalized')).toBe(true);
  });
});

describe('reversal probability', () => {
  it('follows the gambler\'s-ruin result (q/p)^depth', () => {
    expect(reversalProbability(0.25, 2)).toBeCloseTo((1 / 3) ** 2, 12);
  });

  it('falls as confirmations accumulate', () => {
    expect(reversalProbability(0.3, 6)).toBeLessThan(reversalProbability(0.3, 1));
  });

  it('is certain at or above 50% hash power, at any depth', () => {
    // This is what "51% attack" means: no confirmation count is sufficient.
    expect(reversalProbability(0.5, 1000)).toBe(1);
    expect(reversalProbability(0.6, 1000)).toBe(1);
  });

  it('treats zero depth as unconfirmed', () => {
    expect(reversalProbability(0.1, 0)).toBe(1);
  });

  it('reports no safe confirmation count at majority hash power', () => {
    expect(confirmationsForRisk(0.5)).toBe(Infinity);
    expect(Number.isFinite(confirmationsForRisk(0.1))).toBe(true);
    expect(confirmationsForRisk(0.4)).toBeGreaterThan(confirmationsForRisk(0.1));
  });
});

describe('double-spend scenarios', () => {
  it('succeeds under proof-of-work with majority hash power', () => {
    const outcome = simulateDoubleSpend('pow', {
      hashPower: 0.6,
      merchantConfirmations: 6,
      amount: 100,
    });

    expect(outcome.succeeded).toBe(true);
    expect(outcome.confirmationsForSafety).toBe(Infinity);
  });

  it('cannot be attempted under SCP even at 90% influence', () => {
    const outcome = simulateDoubleSpend('scp', {
      hashPower: 0.9,
      merchantConfirmations: 1,
      amount: 100,
    });

    expect(outcome.succeeded).toBe(false);
    expect(outcome.reversalProbability).toBe(0);
    // The failure mode under SCP is halting, not reversal - safety over liveness.
    expect(outcome.narrative.some((line) => /halt/i.test(line))).toBe(true);
  });
});

describe('timeline scrubbing', () => {
  it('shows the chain as it stood before a reorg', () => {
    let chain = createChain('pow');
    chain = mineBlock(chain, { txIds: ['tx1'] });
    chain = mineBlock(chain);
    chain = forkChain(chain, 'attacker', 0);
    chain = mineBlock(chain, { branch: 'attacker', work: 5 });
    chain = mineBlock(chain, { branch: 'attacker', work: 5 });

    const early = stateAtTick(chain, 1);
    expect(early.blocks.length).toBeLessThan(chain.blocks.length);
    // At tick 1 the network believed "main" - which it did.
    expect(early.canonicalBranch).toBe('main');

    expect(stateAtTick(chain, 999).blocks).toHaveLength(chain.blocks.length);
  });
});
