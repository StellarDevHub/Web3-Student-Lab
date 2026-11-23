/**
 * Tests for HorizonLedgerIngestionEngine — Issue #1418
 *
 * Verifies atomic-lock usage, idempotent dedup (ledgers by hash, payments
 * by (chain, eventId)), and reorg-safe rollback, against a hand-rolled
 * mock Prisma client (same pattern as `chain-indexer-engine.test.ts`).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  HorizonLedgerIngestionEngine,
  StellarLedgerRecord,
  StellarPaymentRecord,
} from '../src/jobs/horizonLedgerIngestionEngine.js';

function makeMockTx() {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    processedBlock: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    bridgeEvent: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function makeMockPrisma(tx: ReturnType<typeof makeMockTx>) {
  return {
    $transaction: jest.fn((cb: any) => cb(tx)),
  };
}

const LEDGER_1: StellarLedgerRecord = {
  sequence: 100,
  hash: 'hash-100',
  prevHash: 'hash-99',
  closedAt: '2026-01-01T00:00:00Z',
};

const PAYMENT_1: StellarPaymentRecord = {
  id: 'op-1',
  type: 'payment',
  transactionHash: 'tx-1',
  from: 'GFROM',
  to: 'GTO',
  assetType: 'native',
  amount: '10.0000000',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('HorizonLedgerIngestionEngine', () => {
  let tx: ReturnType<typeof makeMockTx>;
  let prisma: ReturnType<typeof makeMockPrisma>;
  let engine: HorizonLedgerIngestionEngine;

  beforeEach(() => {
    tx = makeMockTx();
    prisma = makeMockPrisma(tx);
    engine = new HorizonLedgerIngestionEngine(prisma as any, { chain: 'STELLAR' });
  });

  describe('getLastIngestedLedger', () => {
    it('returns null when nothing has been ingested', async () => {
      tx.processedBlock.findFirst.mockResolvedValue(null);
      const result = await engine.getLastIngestedLedger();
      expect(result).toBeNull();
    });

    it('maps the highest non-rolled-back ledger row', async () => {
      tx.processedBlock.findFirst.mockResolvedValue({ blockNumber: 42, blockHash: 'h42' });
      const result = await engine.getLastIngestedLedger();
      expect(result).toEqual({ sequence: 42, hash: 'h42' });
    });
  });

  describe('ingestLedger — happy path', () => {
    it('acquires the advisory lock before touching any table', async () => {
      tx.processedBlock.upsert.mockResolvedValue({ id: 'block-1' });

      await engine.ingestLedger(LEDGER_1, [PAYMENT_1]);

      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        'STELLAR'
      );
      const lockCallOrder = tx.$executeRawUnsafe.mock.invocationCallOrder[0];
      const upsertCallOrder = tx.processedBlock.upsert.mock.invocationCallOrder[0];
      expect(lockCallOrder).toBeLessThan(upsertCallOrder as number);
    });

    it('ingests a fresh ledger and its payments, reporting status "ingested"', async () => {
      tx.processedBlock.upsert.mockResolvedValue({ id: 'block-1' });

      const result = await engine.ingestLedger(LEDGER_1, [PAYMENT_1]);

      expect(result).toEqual({
        sequence: 100,
        status: 'ingested',
        paymentsIngested: 1,
        rolledBackLedgers: 0,
      });
      expect(tx.processedBlock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { blockHash: 'hash-100' },
          create: expect.objectContaining({ chain: 'STELLAR', blockNumber: 100, blockHash: 'hash-100' }),
        })
      );
      expect(tx.bridgeEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chain_eventId: { chain: 'STELLAR', eventId: 'op-1' } },
        })
      );
    });

    it('ingests a ledger with zero payments cleanly', async () => {
      tx.processedBlock.upsert.mockResolvedValue({ id: 'block-1' });

      const result = await engine.ingestLedger(LEDGER_1, []);

      expect(result.paymentsIngested).toBe(0);
      expect(result.status).toBe('ingested');
      expect(tx.bridgeEvent.upsert).not.toHaveBeenCalled();
    });
  });

  describe('ingestLedger — idempotent dedup', () => {
    it('short-circuits as "duplicate" when the ledger hash was already ingested', async () => {
      tx.processedBlock.findUnique.mockResolvedValue({ id: 'block-1', blockHash: 'hash-100', isRolledBack: false });

      const result = await engine.ingestLedger(LEDGER_1, [PAYMENT_1]);

      expect(result).toEqual({ sequence: 100, status: 'duplicate', paymentsIngested: 0, rolledBackLedgers: 0 });
      expect(tx.processedBlock.upsert).not.toHaveBeenCalled();
      expect(tx.bridgeEvent.upsert).not.toHaveBeenCalled();
    });

    it('does NOT short-circuit when the existing row with that hash was rolled back', async () => {
      tx.processedBlock.findUnique.mockResolvedValue({ id: 'block-1', blockHash: 'hash-100', isRolledBack: true });
      tx.processedBlock.upsert.mockResolvedValue({ id: 'block-1' });

      const result = await engine.ingestLedger(LEDGER_1, [PAYMENT_1]);

      expect(result.status).toBe('ingested');
      expect(tx.processedBlock.upsert).toHaveBeenCalled();
    });
  });

  describe('ingestLedger — reorg-safe rollback', () => {
    it('rolls back when the next ledger\'s prevHash does not match the last ingested hash', async () => {
      tx.processedBlock.findFirst.mockResolvedValue({ id: 'block-99', blockNumber: 99, blockHash: 'unexpected-hash' });
      tx.processedBlock.findMany.mockResolvedValue([{ id: 'block-99' }]);
      tx.processedBlock.upsert.mockResolvedValue({ id: 'block-100' });

      const result = await engine.ingestLedger(LEDGER_1, [PAYMENT_1]);

      expect(result.status).toBe('reorg-rolled-back');
      expect(result.rolledBackLedgers).toBe(1);
      expect(tx.bridgeEvent.deleteMany).toHaveBeenCalledWith({ where: { processedBlockId: { in: ['block-99'] } } });
      expect(tx.processedBlock.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['block-99'] } } })
      );
      // The new ledger is still ingested after the rollback.
      expect(tx.processedBlock.upsert).toHaveBeenCalled();
    });

    it('rolls back deeper history when a replayed ledger at an old sequence has a different hash', async () => {
      // We're re-processing sequence 100 with a *different* hash than what's
      // on record for a later sequence — simulates catching up against a
      // Horizon node whose recent history diverged.
      tx.processedBlock.findUnique.mockResolvedValue(null); // no exact hash match yet
      tx.processedBlock.findFirst.mockResolvedValue({ id: 'block-105', blockNumber: 105, blockHash: 'hash-105' });
      tx.processedBlock.findMany.mockResolvedValue([{ id: 'block-100' }, { id: 'block-101' }]);
      tx.processedBlock.upsert.mockResolvedValue({ id: 'block-100-new' });

      const result = await engine.ingestLedger(LEDGER_1, []);

      expect(result.status).toBe('reorg-rolled-back');
      expect(tx.processedBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ blockNumber: { gte: 100 } }) })
      );
    });

    it('does not falsely flag a fork when prevHash correctly chains from the last ingested ledger', async () => {
      tx.processedBlock.findFirst.mockResolvedValue({ id: 'block-99', blockNumber: 99, blockHash: 'hash-99' });
      tx.processedBlock.upsert.mockResolvedValue({ id: 'block-100' });

      const result = await engine.ingestLedger(LEDGER_1, [PAYMENT_1]);

      expect(result.status).toBe('ingested');
      expect(tx.bridgeEvent.deleteMany).not.toHaveBeenCalled();
    });
  });
});
