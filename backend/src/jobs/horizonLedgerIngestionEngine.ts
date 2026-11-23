/**
 * Stellar Horizon Ledger Ingestion Engine — Issue #1418 (BE-HARD-27)
 *
 * Ingests Stellar ledgers (and their payment operations) into Postgres
 * with:
 *
 *  - **Atomic Postgres transaction locks**: every ingest runs inside a
 *    single `$transaction` that opens by taking a `pg_advisory_xact_lock`
 *    keyed by `chain`. That closes the classic "check the cursor, then
 *    decide what to write" race: two ingestion workers (or two overlapping
 *    poll ticks of the same worker) can never both observe the same "last
 *    ingested ledger" and both attempt to append after it — the second one
 *    blocks on the lock until the first one's transaction commits, then
 *    re-reads a cursor that already reflects the first one's write. The
 *    lock is transaction-scoped, so it is always released automatically
 *    on commit *or* rollback — no separate unlock call, no risk of a
 *    connection-pool hand-off leaking a held lock.
 *  - **Idempotent event deduping**: ledgers are keyed by their unique
 *    `blockHash`; payment operations are keyed by `(chain, eventId)`
 *    where `eventId` is Horizon's own globally-unique operation id.
 *    Re-ingesting the same ledger or operation is a no-op upsert, not a
 *    duplicate row.
 *  - **Reorg-safe rollback buffer**: each ledger's `prevHash` is compared
 *    against the hash of the last ingested ledger. A mismatch rolls back
 *    every ledger (and its payments) at or after the divergence point
 *    before ingesting the new one.
 *
 * Honesty note: Stellar's SCP consensus finalizes ledgers on close —
 * there is no live chain-reorg in the Bitcoin/Ethereum sense once a
 * ledger has closed. The realistic trigger for this guard is Horizon
 * itself: production Horizon is typically a load-balanced pool of nodes
 * that can be at very slightly different points in history while
 * catching up (or after being restored from different snapshots), so a
 * poller can genuinely observe a ledger whose `prevHash` doesn't match
 * what an earlier poll ingested from a different pool member. This
 * engine treats that the same way a "real" reorg-safe ingester would,
 * which also happens to make it correct if Stellar's finality model
 * ever changes upstream.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import logger from '../utils/logger.js';

export interface StellarLedgerRecord {
  /** Ledger sequence number — Stellar's analogue of a block number. */
  sequence: number;
  hash: string;
  /** Hash of the immediately preceding ledger. */
  prevHash: string;
  closedAt: string;
}

export interface StellarPaymentRecord {
  /** Horizon operation id — globally unique, used as the dedupe key. */
  id: string;
  type: string;
  transactionHash: string;
  sourceAccount?: string;
  from?: string;
  to?: string;
  assetType?: string;
  assetCode?: string;
  amount?: string;
  createdAt: string;
}

export type IngestStatus = 'ingested' | 'duplicate' | 'reorg-rolled-back';

export interface IngestLedgerResult {
  sequence: number;
  status: IngestStatus;
  paymentsIngested: number;
  rolledBackLedgers: number;
}

export interface LastIngestedLedger {
  sequence: number;
  hash: string;
}

export interface HorizonLedgerIngestionEngineOptions {
  /** Logical chain key stored alongside every row. Default 'STELLAR'. */
  chain?: string;
}

/**
 * Minimal transaction-client shape this engine needs, so it can be unit
 * tested against a hand-rolled mock without pulling in a real Prisma
 * runtime (mirrors the pattern already used by `chain-indexer-engine.ts`'s
 * test suite).
 */
type IngestionPrismaClient = Pick<PrismaClient, '$transaction'>;

export class HorizonLedgerIngestionEngine {
  private readonly chain: string;

  constructor(
    private readonly prisma: IngestionPrismaClient,
    options: HorizonLedgerIngestionEngineOptions = {}
  ) {
    this.chain = options.chain ?? 'STELLAR';
  }

  /**
   * Returns the highest-sequence, non-rolled-back ledger ingested so far
   * for this chain, or `null` if nothing has been ingested yet (the
   * poller uses this to decide where to resume).
   */
  async getLastIngestedLedger(): Promise<LastIngestedLedger | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await (tx as unknown as Prisma.TransactionClient).processedBlock.findFirst({
        where: { chain: this.chain, isRolledBack: false },
        orderBy: { blockNumber: 'desc' },
        select: { blockNumber: true, blockHash: true },
      });
      return row ? { sequence: row.blockNumber, hash: row.blockHash } : null;
    });
  }

  /**
   * Ingests a single ledger and its payment operations. Safe to call
   * concurrently (from multiple workers or overlapping poll ticks) —
   * see the class doc comment for why the advisory lock makes that safe.
   */
  async ingestLedger(
    ledger: StellarLedgerRecord,
    payments: StellarPaymentRecord[]
  ): Promise<IngestLedgerResult> {
    return this.prisma.$transaction(async (txClient) => {
      const tx = txClient as unknown as Prisma.TransactionClient;

      // Real, atomic Postgres lock: serializes this entire read-decide-write
      // critical section across every process/worker touching this chain's
      // cursor. Transaction-scoped, so it releases automatically when this
      // $transaction callback returns (commit) or throws (rollback).
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', this.chain);

      const existingByHash = await tx.processedBlock.findUnique({ where: { blockHash: ledger.hash } });
      if (existingByHash && !existingByHash.isRolledBack) {
        return { sequence: ledger.sequence, status: 'duplicate' as const, paymentsIngested: 0, rolledBackLedgers: 0 };
      }

      const last = await tx.processedBlock.findFirst({
        where: { chain: this.chain, isRolledBack: false },
        orderBy: { blockNumber: 'desc' },
      });

      let status: IngestStatus = 'ingested';
      let rolledBackLedgers = 0;

      const forkDetected =
        !!last &&
        ((ledger.sequence <= last.blockNumber && last.blockHash !== ledger.hash) ||
          (ledger.sequence === last.blockNumber + 1 && ledger.prevHash !== last.blockHash));

      if (forkDetected) {
        rolledBackLedgers = await this.rollbackFrom(tx, Math.min(ledger.sequence, last!.blockNumber));
        status = 'reorg-rolled-back';
        logger.warn('[HorizonLedgerIngestionEngine] Fork detected — rolled back ledgers', {
          chain: this.chain,
          incomingSequence: ledger.sequence,
          incomingPrevHash: ledger.prevHash,
          lastIngestedSequence: last!.blockNumber,
          lastIngestedHash: last!.blockHash,
          rolledBackLedgers,
        });
      }

      const processedBlock = await tx.processedBlock.upsert({
        where: { blockHash: ledger.hash },
        create: {
          chain: this.chain,
          blockNumber: ledger.sequence,
          blockHash: ledger.hash,
          parentHash: ledger.prevHash,
          timestamp: new Date(ledger.closedAt),
        },
        update: {
          processedAt: new Date(),
          isRolledBack: false,
          rolledBackAt: null,
        },
      });

      let paymentsIngested = 0;
      for (const payment of payments) {
        await tx.bridgeEvent.upsert({
          where: { chain_eventId: { chain: this.chain, eventId: payment.id } },
          create: {
            chain: this.chain,
            blockNumber: ledger.sequence,
            blockHash: ledger.hash,
            processedBlockId: processedBlock.id,
            eventId: payment.id,
            eventType: payment.type,
            sourceChain: 'STELLAR',
            targetChain: 'STELLAR',
            data: { ...payment },
            transactionHash: payment.transactionHash,
            processed: true,
            processedAt: new Date(),
          },
          update: {
            processedAt: new Date(),
            processed: true,
          },
        });
        paymentsIngested++;
      }

      return { sequence: ledger.sequence, status, paymentsIngested, rolledBackLedgers };
    });
  }

  /**
   * Rolls back every non-rolled-back ledger (and its payment events) at
   * or after `forkSequence` for this chain — the "rollback buffer".
   * Marks rows `isRolledBack` rather than physically deleting the
   * ledger record itself, preserving an audit trail of what was
   * superseded; associated payment events *are* deleted, since they are
   * cheap to re-ingest once the correct ledger is (re-)processed and
   * keeping stale ones around risks them being double-counted elsewhere.
   */
  private async rollbackFrom(tx: Prisma.TransactionClient, forkSequence: number): Promise<number> {
    const blocksToRollback = await tx.processedBlock.findMany({
      where: { chain: this.chain, blockNumber: { gte: forkSequence }, isRolledBack: false },
      select: { id: true },
    });

    if (blocksToRollback.length === 0) return 0;

    const ids = blocksToRollback.map((b) => b.id);

    await tx.bridgeEvent.deleteMany({ where: { processedBlockId: { in: ids } } });
    await tx.processedBlock.updateMany({
      where: { id: { in: ids } },
      data: { isRolledBack: true, rolledBackAt: new Date() },
    });

    return ids.length;
  }
}
