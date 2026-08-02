import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPLORER_FILTER,
  filterExplorerTransactions,
  mergeExplorerStats,
  suggestHackathonIdeasFromActivity,
  buildStellarExpertLink,
} from '../blockExplorer';
import type { ExplorerTransaction } from '@/hooks/useBlockchainExplorer';

const sampleTx: ExplorerTransaction = {
  id: '1',
  hash: 'ABC123',
  source: 'GABC',
  destination: 'GXYZ',
  operation: 'INVOKE_HOST_FUNCTION',
  amount: '10',
  asset: 'XLM',
  fee: '200',
  ledger: 100,
  status: 'SUCCESS',
  timestamp: new Date().toISOString(),
};

describe('blockExplorer', () => {
  it('filters transactions by query', () => {
    const filtered = filterExplorerTransactions([sampleTx], {
      ...DEFAULT_EXPLORER_FILTER,
      query: 'abc',
    });
    expect(filtered).toHaveLength(1);
  });

  it('filters by status', () => {
    const failed = { ...sampleTx, id: '2', status: 'FAILED' as const };
    const filtered = filterExplorerTransactions([sampleTx, failed], {
      ...DEFAULT_EXPLORER_FILTER,
      status: 'FAILED',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe('FAILED');
  });

  it('computes merged stats', () => {
    const stats = mergeExplorerStats([sampleTx]);
    expect(stats.totalTransactions).toBe(1);
    expect(stats.successRate).toBe(100);
  });

  it('suggests hackathon ideas from invoke activity', () => {
    const ideas = suggestHackathonIdeasFromActivity([sampleTx]);
    expect(ideas.some((i) => i.includes('Soroban'))).toBe(true);
  });

  it('builds stellar expert links', () => {
    expect(buildStellarExpertLink('hash')).toContain('testnet/tx/hash');
  });
});
