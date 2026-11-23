/**
 * Tests for HorizonLedgerIngestionWorker — Issue #1418
 *
 * The engine itself is exercised in horizonLedgerIngestionEngine.test.ts;
 * here we verify the Horizon-polling boundary: cursor resolution, request
 * shape, payment-operation filtering, and that one ledger's ingestion
 * failure doesn't abort the rest of the batch.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { HorizonLedgerIngestionWorker } from '../src/jobs/horizonLedgerIngestionWorker.js';
import type { HorizonLedgerIngestionEngine, IngestLedgerResult } from '../src/jobs/horizonLedgerIngestionEngine.js';

function jsonResponse(records: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ _embedded: { records } }) };
}

function makeEngineStub(overrides: Partial<HorizonLedgerIngestionEngine> = {}) {
  return {
    getLastIngestedLedger: jest.fn().mockResolvedValue(null),
    ingestLedger: jest.fn().mockResolvedValue({
      sequence: 0,
      status: 'ingested',
      paymentsIngested: 0,
      rolledBackLedgers: 0,
    } satisfies IngestLedgerResult),
    ...overrides,
  } as unknown as HorizonLedgerIngestionEngine;
}

describe('HorizonLedgerIngestionWorker', () => {
  describe('pollOnce', () => {
    it('resumes from the engine cursor, fetches ledgers after it, and ingests each one', async () => {
      const engine = makeEngineStub({
        getLastIngestedLedger: jest.fn().mockResolvedValue({ sequence: 100, hash: 'hash-100' }),
      });

      const fetchFn = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/ledgers?cursor=100')) {
          return jsonResponse([
            { sequence: 101, hash: 'hash-101', prev_hash: 'hash-100', closed_at: '2026-01-01T00:00:01Z' },
            { sequence: 102, hash: 'hash-102', prev_hash: 'hash-101', closed_at: '2026-01-01T00:00:02Z' },
          ]);
        }
        // Per-ledger operations
        return jsonResponse([
          { id: 'op-1', type: 'payment', transaction_hash: 'tx-1', created_at: '2026-01-01T00:00:01Z' },
          { id: 'op-2', type: 'set_options', transaction_hash: 'tx-2', created_at: '2026-01-01T00:00:01Z' },
        ]);
      }) as jest.Mock;

      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch, batchSize: 50 });
      const result = await worker.pollOnce();

      expect(result.ledgersFetched).toBe(2);
      expect(result.ledgersIngested).toBe(2);
      expect(result.lastSequence).toBe(102);
      expect(engine.ingestLedger).toHaveBeenCalledTimes(2);

      // Non-payment operation type (set_options) must be filtered out.
      const [, paymentsArg] = (engine.ingestLedger as jest.Mock).mock.calls[0] as [unknown, unknown[]];
      expect(paymentsArg).toHaveLength(1);
      expect((paymentsArg[0] as { id: string }).id).toBe('op-1');
    });

    it('resolves a start sequence from Horizon\'s latest ledger when nothing has been ingested yet', async () => {
      const engine = makeEngineStub();
      const fetchFn = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('order=desc&limit=1')) {
          return jsonResponse([{ sequence: 500, hash: 'h500', prev_hash: 'h499', closed_at: '2026-01-01T00:00:00Z' }]);
        }
        if (url.includes('cursor=499')) {
          return jsonResponse([]);
        }
        return jsonResponse([]);
      }) as jest.Mock;

      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch });
      await worker.pollOnce();

      expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('order=desc&limit=1'));
      expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('cursor=499'));
    });

    it('uses an explicit startSequence instead of querying Horizon for the latest ledger', async () => {
      const engine = makeEngineStub();
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse([])) as jest.Mock;

      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch, startSequence: 42 });
      await worker.pollOnce();

      expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('cursor=42'));
      expect(fetchFn).not.toHaveBeenCalledWith(expect.stringContaining('order=desc&limit=1'));
    });

    it('reports reorgsDetected when the engine reports a rollback', async () => {
      const engine = makeEngineStub({
        getLastIngestedLedger: jest.fn().mockResolvedValue({ sequence: 100, hash: 'hash-100' }),
        ingestLedger: jest.fn().mockResolvedValue({
          sequence: 101,
          status: 'reorg-rolled-back',
          paymentsIngested: 0,
          rolledBackLedgers: 3,
        } satisfies IngestLedgerResult),
      });
      const fetchFn = jest.fn().mockResolvedValue(
        jsonResponse([{ sequence: 101, hash: 'hash-101', prev_hash: 'wrong', closed_at: '2026-01-01T00:00:00Z' }])
      ) as jest.Mock;

      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch });
      const result = await worker.pollOnce();

      expect(result.reorgsDetected).toBe(1);
    });

    it('continues ingesting remaining ledgers when one ledger fails', async () => {
      const engine = makeEngineStub({
        getLastIngestedLedger: jest.fn().mockResolvedValue({ sequence: 100, hash: 'hash-100' }),
        ingestLedger: jest
          .fn()
          .mockRejectedValueOnce(new Error('db unavailable'))
          .mockResolvedValueOnce({
            sequence: 102,
            status: 'ingested',
            paymentsIngested: 0,
            rolledBackLedgers: 0,
          } satisfies IngestLedgerResult),
      });
      const fetchFn = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/ledgers?cursor=')) {
          return jsonResponse([
            { sequence: 101, hash: 'h101', prev_hash: 'hash-100', closed_at: '2026-01-01T00:00:00Z' },
            { sequence: 102, hash: 'h102', prev_hash: 'h101', closed_at: '2026-01-01T00:00:00Z' },
          ]);
        }
        return jsonResponse([]);
      }) as jest.Mock;

      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch });
      const result = await worker.pollOnce();

      expect(result.ledgersFetched).toBe(2);
      expect(result.ledgersIngested).toBe(1); // only the second one succeeded
      expect(engine.ingestLedger).toHaveBeenCalledTimes(2);
    });

    it('does not count a duplicate ledger toward ledgersIngested', async () => {
      const engine = makeEngineStub({
        getLastIngestedLedger: jest.fn().mockResolvedValue({ sequence: 100, hash: 'hash-100' }),
        ingestLedger: jest.fn().mockResolvedValue({
          sequence: 101,
          status: 'duplicate',
          paymentsIngested: 0,
          rolledBackLedgers: 0,
        } satisfies IngestLedgerResult),
      });
      const fetchFn = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/ledgers?cursor=')) {
          return jsonResponse([{ sequence: 101, hash: 'h101', prev_hash: 'hash-100', closed_at: '2026-01-01T00:00:00Z' }]);
        }
        return jsonResponse([]);
      }) as jest.Mock;

      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch });
      const result = await worker.pollOnce();

      expect(result.ledgersIngested).toBe(0);
    });

    it('throws when Horizon itself returns a non-OK response', async () => {
      const engine = makeEngineStub({
        getLastIngestedLedger: jest.fn().mockResolvedValue({ sequence: 100, hash: 'hash-100' }),
      });
      const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as jest.Mock;

      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch });

      await expect(worker.pollOnce()).rejects.toThrow(/HTTP 503/);
    });
  });

  describe('start/stop', () => {
    it('does not throw when stop() is called without a prior start()', () => {
      const worker = new HorizonLedgerIngestionWorker(makeEngineStub());
      expect(() => worker.stop()).not.toThrow();
    });

    it('start() followed by stop() cleans up the interval without firing extra polls', async () => {
      jest.useFakeTimers();
      const engine = makeEngineStub();
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse([])) as jest.Mock;
      const worker = new HorizonLedgerIngestionWorker(engine, { fetchFn: fetchFn as typeof fetch, startSequence: 1 });

      worker.start(1_000);
      worker.stop();
      jest.advanceTimersByTime(10_000);

      expect(engine.getLastIngestedLedger).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
