import { describe, expect, it, jest, afterEach, beforeEach } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';
import explorerRouter from '../src/routes/generator/explorer.routes.js';

// Force simulation mode for route tests
const originalEnv = { ...process.env };

// Mock the blockExplorer service to avoid Redis/cache dependencies
jest.mock('../src/services/blockExplorer.service.js', () => {
  const mockTx = {
    id: 'tx_route_1',
    hash: 'mock_hash_001',
    source: 'GSOURCE',
    destination: 'GDEST',
    operation: 'PAYMENT',
    amount: '100.00',
    asset: 'XLM',
    fee: '100',
    ledger: 500000,
    status: 'SUCCESS',
    timestamp: '2025-01-01T00:00:00Z',
  };

  const mockSnapshot = {
    transactions: [mockTx],
    stats: {
      totalTransactions: 1,
      successRate: 100,
      averageFee: '100',
      latestLedger: 500000,
    },
    generatedAt: '2025-01-01T00:00:00Z',
    mode: 'simulation',
  };

  // Keep track of whether we should throw
  let shouldThrow = false;
  let throwError: Error | null = null;

  return {
    __esModule: true,
    getExplorerSnapshot: jest.fn(async () => {
      if (shouldThrow && throwError) {
        throw throwError;
      }
      return mockSnapshot;
    }),
    filterTransactions: jest.fn((_txs: unknown[], query: string) => {
      if (!query) return [mockTx];
      return query.toLowerCase() === 'payment' ? [mockTx] : [];
    }),
    buildExplorerLink: jest.fn(
      (hash: string, network: string = 'testnet') =>
        `https://stellar.expert/explorer/${network}/tx/${hash}`
    ),
    ExplorerAdapterError: class ExplorerAdapterError extends Error {
      public readonly code: string;
      public readonly statusCode: number;
      constructor(message: string, code: string = 'EXPLORER_ADAPTER_ERROR', statusCode: number = 500) {
        super(message);
        this.name = 'ExplorerAdapterError';
        this.code = code;
        this.statusCode = statusCode;
      }
    },
    // Test helpers
    _setThrowBehavior: (shouldThrowVal: boolean, error?: Error) => {
      shouldThrow = shouldThrowVal;
      throwError = error ?? null;
    },
  };
});

// Mock the logger to suppress log output
jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

let app: Express;

beforeEach(() => {
  app = express();
  app.use('/api/v1/generator', explorerRouter);
  process.env.BLOCK_EXPLORER_MODE = 'simulation';
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('Explorer Routes — GET /api/v1/generator/explorer/snapshot', () => {
  it('returns 200 with snapshot data', async () => {
    const res = await request(app).get('/api/v1/generator/explorer/snapshot');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.transactions).toBeInstanceOf(Array);
    expect(res.body.data.stats).toBeDefined();
  });

  it('passes limit and seed query params', async () => {
    const res = await request(app)
      .get('/api/v1/generator/explorer/snapshot')
      .query({ limit: 10, seed: 99 });
    expect(res.status).toBe(200);
  });

  it('accepts mode=simulation query param', async () => {
    const res = await request(app)
      .get('/api/v1/generator/explorer/snapshot')
      .query({ mode: 'simulation' });
    expect(res.status).toBe(200);
  });

  it('accepts useSimulation=true query param', async () => {
    const res = await request(app)
      .get('/api/v1/generator/explorer/snapshot')
      .query({ useSimulation: 'true' });
    expect(res.status).toBe(200);
  });
});

describe('Explorer Routes — GET /api/v1/generator/explorer/search', () => {
  it('returns 200 with filtered transactions', async () => {
    const res = await request(app)
      .get('/api/v1/generator/explorer/search')
      .query({ q: 'PAYMENT' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.transactions).toBeInstanceOf(Array);
    expect(res.body.data.query).toBe('PAYMENT');
  });

  it('returns empty results for non-matching query', async () => {
    const res = await request(app)
      .get('/api/v1/generator/explorer/search')
      .query({ q: 'nonexistent' });
    expect(res.status).toBe(200);
    expect(res.body.data.transactions).toEqual([]);
  });

  it('handles empty query string', async () => {
    const res = await request(app)
      .get('/api/v1/generator/explorer/search');
    expect(res.status).toBe(200);
  });
});

describe('Explorer Routes — GET /api/v1/generator/explorer/link/:hash', () => {
  it('returns testnet link by default', async () => {
    const res = await request(app).get('/api/v1/generator/explorer/link/abc123');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.link).toContain('testnet/tx/abc123');
  });

  it('returns public link when network=public', async () => {
    const res = await request(app)
      .get('/api/v1/generator/explorer/link/abc123')
      .query({ network: 'public' });
    expect(res.status).toBe(200);
    expect(res.body.data.link).toContain('public/tx/abc123');
  });
});
