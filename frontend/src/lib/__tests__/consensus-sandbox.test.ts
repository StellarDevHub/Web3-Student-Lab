import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSENSUS_NODES, runConsensusRound } from '../consensus-sandbox';

describe('consensus sandbox', () => {
  it('selects proof-of-work leader by hash power', () => {
    const result = runConsensusRound('pow', DEFAULT_CONSENSUS_NODES);

    expect(result.leaderId).toBe('bob');
    expect(result.finalized).toBe(true);
  });

  it('selects proof-of-stake leader by active stake', () => {
    const result = runConsensusRound('pos', DEFAULT_CONSENSUS_NODES);

    expect(result.leaderId).toBe('alice');
    expect(result.agreementPercent).toBe(40);
  });

  it('requires quorum overlap for federated voting', () => {
    const result = runConsensusRound('fba', DEFAULT_CONSENSUS_NODES);

    expect(result.leaderId).toBe('alice');
    expect(result.agreementPercent).toBeGreaterThanOrEqual(50);
  });

  it('does not finalize when every validator is offline', () => {
    const result = runConsensusRound(
      'pos',
      DEFAULT_CONSENSUS_NODES.map((node) => ({ ...node, online: false }))
    );

    expect(result.finalized).toBe(false);
    expect(result.leaderId).toBeNull();
  });
});
