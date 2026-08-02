import { describe, expect, it } from '@jest/globals';
import {
  filterTransactions,
  getExplorerSnapshot,
  buildExplorerLink,
} from '../src/services/blockExplorer.service.js';

describe('Block Explorer Service', () => {
  it('generates deterministic snapshot for a seed', async () => {
    const a = await getExplorerSnapshot({ limit: 10, seed: 42, cacheTtl: 60 });
    const b = await getExplorerSnapshot({ limit: 10, seed: 42, cacheTtl: 60 });
    expect(a.transactions).toHaveLength(10);
    expect(a.transactions[0].hash).toBe(b.transactions[0].hash);
    expect(a.stats.totalTransactions).toBe(10);
  });

  it('filters transactions by query', async () => {
    const snapshot = await getExplorerSnapshot({ limit: 20, seed: 99 });
    const filtered = filterTransactions(snapshot.transactions, snapshot.transactions[0].operation);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it('builds explorer links', () => {
    expect(buildExplorerLink('abc123')).toContain('testnet/tx/abc123');
    expect(buildExplorerLink('abc123', 'public')).toContain('public/tx/abc123');
  });
});
