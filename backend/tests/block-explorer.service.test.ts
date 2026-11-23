import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import {
  filterTransactions,
  getExplorerSnapshot,
  buildExplorerLink,
  SimulationExplorerAdapter,
  LiveStellarExplorerAdapter,
  ExplorerAdapterError,
} from '../src/services/blockExplorer.service.js';
import { computeStats, ExplorerTransaction } from '../src/services/adapters/blockExplorerAdapter.js';
import { resolveExplorerMode } from '../src/services/adapters/explorerAdapterFactory.js';

// Force simulation mode for unit tests by default
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.BLOCK_EXPLORER_MODE = 'simulation';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ---------------------------------------------------------------------------
// SimulationExplorerAdapter
// ---------------------------------------------------------------------------
describe('SimulationExplorerAdapter', () => {
  const adapter = new SimulationExplorerAdapter();

  it('has mode "simulation"', () => {
    expect(adapter.mode).toBe('simulation');
  });

  it('generates deterministic transactions for a given seed', async () => {
    const txsA = await adapter.fetchTransactions(10, { seed: 42 });
    const txsB = await adapter.fetchTransactions(10, { seed: 42 });
    expect(txsA).toHaveLength(10);
    expect(txsA[0]!.hash).toBe(txsB[0]!.hash);
    expect(txsA[0]!.id).toBe('tx_42_0');
  });

  it('respects the limit parameter and caps at 100', async () => {
    const txs = await adapter.fetchTransactions(200);
    expect(txs).toHaveLength(100);
  });

  it('clamps limit to at least 1', async () => {
    const txs = await adapter.fetchTransactions(0);
    expect(txs).toHaveLength(1);
  });

  it('generates valid ExplorerTransaction fields', async () => {
    const txs = await adapter.fetchTransactions(5, { seed: 1 });
    for (const tx of txs) {
      expect(tx.id).toBeDefined();
      expect(tx.hash).toBeDefined();
      expect(tx.source).toMatch(/^G/);
      expect(tx.destination).toMatch(/^G/);
      expect(['PAYMENT', 'INVOKE_HOST_FUNCTION', 'CHANGE_TRUST', 'MANAGE_OFFER', 'CREATE_ACCOUNT']).toContain(tx.operation);
      expect(['XLM', 'USDC', 'EURC', 'AQUA']).toContain(tx.asset);
      expect(['SUCCESS', 'FAILED']).toContain(tx.status);
      expect(Number(tx.fee)).toBeGreaterThanOrEqual(100);
      expect(tx.ledger).toBeGreaterThanOrEqual(524000);
      expect(new Date(tx.timestamp).getTime()).not.toBeNaN();
    }
  });

  it('getSnapshot returns a snapshot with mode "simulation"', async () => {
    const snapshot = await adapter.getSnapshot({ limit: 10, seed: 42 });
    expect(snapshot.mode).toBe('simulation');
    expect(snapshot.transactions).toHaveLength(10);
    expect(snapshot.stats.totalTransactions).toBe(10);
    expect(snapshot.generatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// LiveStellarExplorerAdapter — normalizeTransaction
// ---------------------------------------------------------------------------
describe('LiveStellarExplorerAdapter.normalizeTransaction', () => {
  const adapter = new LiveStellarExplorerAdapter({ horizonUrl: 'https://example.com' });

  it('normalizes a well-formed Horizon transaction record', () => {
    const raw = {
      id: '12345',
      hash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      source_account: 'GBZXN7PIRZGNMHGA7MUUUF4GWDBC5',
      successful: true,
      created_at: '2025-01-01T00:00:00Z',
      ledger: 100000,
      fee_charged: '200',
      max_fee: '500',
      operation_count: 1,
      memo_type: 'none',
    };

    const tx = adapter.normalizeTransaction(raw, 0);
    expect(tx.id).toBe('12345');
    expect(tx.hash).toBe('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789');
    expect(tx.source).toBe('GBZXN7PIRZGNMHGA7MUUUF4GWDBC5');
    expect(tx.status).toBe('SUCCESS');
    expect(tx.ledger).toBe(100000);
    expect(tx.fee).toBe('200');
    expect(tx.timestamp).toBe('2025-01-01T00:00:00Z');
  });

  it('handles missing/empty hash by falling back to id', () => {
    const raw = { id: 'fallback-id', hash: '', successful: false, ledger: 5 };
    const tx = adapter.normalizeTransaction(raw, 0);
    expect(tx.hash).toBe('fallback-id');
  });

  it('handles a completely null record', () => {
    const tx = adapter.normalizeTransaction(null, 7);
    expect(tx.id).toBe('tx_malformed_7');
    expect(tx.status).toBe('FAILED');
    expect(tx.source).toBe('UNKNOWN_SOURCE');
  });

  it('handles an undefined record', () => {
    const tx = adapter.normalizeTransaction(undefined, 3);
    expect(tx.id).toBe('tx_malformed_3');
  });

  it('handles a non-object (string) record', () => {
    const tx = adapter.normalizeTransaction('garbage', 1);
    expect(tx.id).toBe('tx_malformed_1');
  });

  it('falls back on missing fields with safe defaults', () => {
    const raw = {}; // all fields missing
    const tx = adapter.normalizeTransaction(raw, 0);
    expect(tx.hash).toBe('HASH_UNKNOWN_0');
    expect(tx.source).toBe('UNKNOWN_SOURCE');
    expect(tx.status).toBe('FAILED');
    expect(tx.ledger).toBe(0);
    expect(tx.fee).toBe('100');
  });

  it('maps ledger from string to number', () => {
    const raw = { ledger: '99999' };
    const tx = adapter.normalizeTransaction(raw, 0);
    expect(tx.ledger).toBe(99999);
  });
});

// ---------------------------------------------------------------------------
// LiveStellarExplorerAdapter — fetchTransactions (mocked fetch)
// ---------------------------------------------------------------------------
describe('LiveStellarExplorerAdapter.fetchTransactions', () => {
  const adapter = new LiveStellarExplorerAdapter({
    horizonUrl: 'https://horizon-testnet.stellar.org',
    defaultTimeoutMs: 2000,
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns normalized transactions on a successful Horizon response', async () => {
    const mockRecords = [
      {
        id: 'tx1',
        hash: 'hash1',
        source_account: 'GSOURCE1',
        successful: true,
        created_at: '2025-06-01T12:00:00Z',
        ledger: 500000,
        fee_charged: '100',
        operation_count: 1,
        memo_type: 'none',
      },
      {
        id: 'tx2',
        hash: 'hash2',
        source_account: 'GSOURCE2',
        successful: false,
        created_at: '2025-06-01T12:01:00Z',
        ledger: 500001,
        fee_charged: '200',
        operation_count: 2,
        memo_type: 'text',
        memo: 'test-memo',
      },
    ];

    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ _embedded: { records: mockRecords } }),
    } as Response);

    const txs = await adapter.fetchTransactions(10);
    expect(txs).toHaveLength(2);
    expect(txs[0]!.id).toBe('tx1');
    expect(txs[0]!.status).toBe('SUCCESS');
    expect(txs[1]!.status).toBe('FAILED');
    expect(txs[1]!.destination).toBe('test-memo');
  });

  it('throws ExplorerAdapterError on HTTP error status', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    let caught: unknown;
    try {
      await adapter.fetchTransactions(5);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExplorerAdapterError);
    expect((caught as ExplorerAdapterError).code).toBe('HORIZON_HTTP_ERROR');
    expect((caught as ExplorerAdapterError).statusCode).toBe(503);
  });

  it('throws ExplorerAdapterError on timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

    let caught: unknown;
    try {
      await adapter.fetchTransactions(5, { timeoutMs: 100 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExplorerAdapterError);
    expect((caught as ExplorerAdapterError).code).toBe('HORIZON_TIMEOUT');
    expect((caught as ExplorerAdapterError).statusCode).toBe(504);
  });

  it('throws ExplorerAdapterError on generic network failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    let caught: unknown;
    try {
      await adapter.fetchTransactions(5);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExplorerAdapterError);
    expect((caught as ExplorerAdapterError).code).toBe('HORIZON_NETWORK_ERROR');
  });

  it('returns empty array if _embedded.records is missing', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ _embedded: {} }),
    } as Response);

    const txs = await adapter.fetchTransactions(5);
    expect(txs).toEqual([]);
  });

  it('returns empty array if body has no _embedded at all', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const txs = await adapter.fetchTransactions(5);
    expect(txs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// explorerAdapterFactory — resolveExplorerMode
// ---------------------------------------------------------------------------
describe('resolveExplorerMode', () => {
  afterEach(() => {
    delete process.env.BLOCK_EXPLORER_MODE;
    delete process.env.USE_SIMULATED_EXPLORER;
  });

  it('returns mode from options when explicitly set', () => {
    expect(resolveExplorerMode({ mode: 'simulation' })).toBe('simulation');
    expect(resolveExplorerMode({ mode: 'live' })).toBe('live');
  });

  it('returns simulation when useSimulation is true', () => {
    expect(resolveExplorerMode({ useSimulation: true })).toBe('simulation');
  });

  it('returns live when useSimulation is false', () => {
    expect(resolveExplorerMode({ useSimulation: false })).toBe('live');
  });

  it('reads from BLOCK_EXPLORER_MODE env var', () => {
    process.env.BLOCK_EXPLORER_MODE = 'simulation';
    expect(resolveExplorerMode({})).toBe('simulation');
    process.env.BLOCK_EXPLORER_MODE = 'live';
    expect(resolveExplorerMode({})).toBe('live');
  });

  it('reads from USE_SIMULATED_EXPLORER env var', () => {
    delete process.env.BLOCK_EXPLORER_MODE;
    process.env.USE_SIMULATED_EXPLORER = 'true';
    expect(resolveExplorerMode({})).toBe('simulation');
  });

  it('defaults to live when no env or options', () => {
    delete process.env.BLOCK_EXPLORER_MODE;
    delete process.env.USE_SIMULATED_EXPLORER;
    expect(resolveExplorerMode({})).toBe('live');
  });
});

// ---------------------------------------------------------------------------
// computeStats
// ---------------------------------------------------------------------------
describe('computeStats', () => {
  it('returns zero stats for empty array', () => {
    const stats = computeStats([]);
    expect(stats).toEqual({ totalTransactions: 0, successRate: 0, averageFee: '0', latestLedger: 0 });
  });

  it('correctly computes stats for transactions', () => {
    const txs: ExplorerTransaction[] = [
      { id: '1', hash: 'h1', source: 's', destination: 'd', operation: 'PAYMENT', amount: '100', asset: 'XLM', fee: '100', ledger: 10, status: 'SUCCESS', timestamp: '' },
      { id: '2', hash: 'h2', source: 's', destination: 'd', operation: 'PAYMENT', amount: '200', asset: 'XLM', fee: '200', ledger: 20, status: 'FAILED', timestamp: '' },
    ];
    const stats = computeStats(txs);
    expect(stats.totalTransactions).toBe(2);
    expect(stats.successRate).toBe(50);
    expect(stats.averageFee).toBe('150');
    expect(stats.latestLedger).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Backwards-compatible getExplorerSnapshot
// ---------------------------------------------------------------------------
describe('getExplorerSnapshot (service-level, simulation mode)', () => {
  it('generates deterministic snapshot for a seed', async () => {
    const a = await getExplorerSnapshot({ limit: 10, seed: 42, cacheTtl: 0, mode: 'simulation' });
    const b = await getExplorerSnapshot({ limit: 10, seed: 42, cacheTtl: 0, mode: 'simulation' });
    expect(a.transactions).toHaveLength(10);
    expect(a.transactions[0]!.hash).toBe(b.transactions[0]!.hash);
    expect(a.stats.totalTransactions).toBe(10);
  });

  it('returns mode property in simulation', async () => {
    const snapshot = await getExplorerSnapshot({ limit: 5, seed: 1, cacheTtl: 0, mode: 'simulation' });
    expect(snapshot.mode).toBe('simulation');
  });
});

// ---------------------------------------------------------------------------
// filterTransactions
// ---------------------------------------------------------------------------
describe('filterTransactions', () => {
  it('filters transactions by query', async () => {
    const snapshot = await getExplorerSnapshot({ limit: 20, seed: 99, cacheTtl: 0, mode: 'simulation' });
    const filtered = filterTransactions(snapshot.transactions, snapshot.transactions[0]!.operation);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it('returns all transactions for empty query', () => {
    const txs: ExplorerTransaction[] = [
      { id: '1', hash: 'h1', source: 's', destination: 'd', operation: 'PAYMENT', amount: '100', asset: 'XLM', fee: '100', ledger: 10, status: 'SUCCESS', timestamp: '' },
    ];
    expect(filterTransactions(txs, '')).toEqual(txs);
    expect(filterTransactions(txs, '   ')).toEqual(txs);
  });

  it('matches by hash', () => {
    const txs: ExplorerTransaction[] = [
      { id: '1', hash: 'uniqueHash123', source: 's', destination: 'd', operation: 'PAYMENT', amount: '100', asset: 'XLM', fee: '100', ledger: 10, status: 'SUCCESS', timestamp: '' },
    ];
    expect(filterTransactions(txs, 'uniquehash')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildExplorerLink
// ---------------------------------------------------------------------------
describe('buildExplorerLink', () => {
  it('builds testnet link by default', () => {
    expect(buildExplorerLink('abc123')).toContain('testnet/tx/abc123');
  });

  it('builds public link', () => {
    expect(buildExplorerLink('abc123', 'public')).toContain('public/tx/abc123');
  });
});

// ---------------------------------------------------------------------------
// ExplorerAdapterError
// ---------------------------------------------------------------------------
describe('ExplorerAdapterError', () => {
  it('has correct name, code, and statusCode', () => {
    const err = new ExplorerAdapterError('test error', 'TEST_CODE', 503);
    expect(err.name).toBe('ExplorerAdapterError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe('test error');
    expect(err instanceof Error).toBe(true);
  });

  it('uses defaults when not specified', () => {
    const err = new ExplorerAdapterError('default');
    expect(err.code).toBe('EXPLORER_ADAPTER_ERROR');
    expect(err.statusCode).toBe(500);
  });
});
