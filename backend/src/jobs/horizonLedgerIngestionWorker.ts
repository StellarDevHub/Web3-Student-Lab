/**
 * Stellar Horizon Ledger Ingestion Worker — Issue #1418 (BE-HARD-27)
 *
 * Polls Horizon's public REST API for new ledgers (in ascending sequence
 * order, resuming from wherever `HorizonLedgerIngestionEngine` last left
 * off) and, for each ledger, its payment operations — then feeds both
 * into the engine for atomic, reorg-safe, deduped ingestion.
 *
 * Talks to Horizon over plain `fetch` against its documented REST
 * endpoints rather than the heavier `@stellar/stellar-sdk` `Horizon.Server`
 * class, purely so the HTTP boundary can be injected (`fetchFn`) for fast,
 * deterministic unit tests — the same dependency-injection pattern already
 * used by `ipfs.gateway.service.ts` elsewhere in this codebase.
 */

import logger from '../utils/logger.js';
import {
  HorizonLedgerIngestionEngine,
  type StellarLedgerRecord,
  type StellarPaymentRecord,
} from './horizonLedgerIngestionEngine.js';

interface HorizonLedgerApiRecord {
  sequence: number;
  hash: string;
  prev_hash: string;
  closed_at: string;
}

interface HorizonPaymentApiRecord {
  id: string;
  type: string;
  transaction_hash: string;
  source_account?: string;
  from?: string;
  to?: string;
  asset_type?: string;
  asset_code?: string;
  amount?: string;
  created_at: string;
}

interface HorizonCollectionPage<T> {
  _embedded: { records: T[] };
}

/** Operation types Horizon reports that move value — what "ingest transactions" means here. */
const PAYMENT_OPERATION_TYPES = new Set([
  'payment',
  'path_payment_strict_send',
  'path_payment_strict_receive',
  'create_account',
  'account_merge',
]);

export interface HorizonLedgerIngestionWorkerOptions {
  horizonUrl?: string;
  /** How many ledgers to fetch per poll tick. Default 50. */
  batchSize?: number;
  /** Injected fetch implementation — useful for unit testing. */
  fetchFn?: typeof fetch;
  /**
   * Sequence to start from when nothing has been ingested yet. If unset,
   * the worker fetches Horizon's current latest ledger and starts there
   * (i.e. "ingest going forward", not "backfill all of history").
   */
  startSequence?: number;
}

export interface PollResult {
  ledgersFetched: number;
  ledgersIngested: number;
  reorgsDetected: number;
  lastSequence: number | null;
}

export class HorizonLedgerIngestionWorker {
  private readonly horizonUrl: string;
  private readonly batchSize: number;
  private readonly fetchFn: typeof fetch;
  private readonly startSequence: number | undefined;

  private polling = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly engine: HorizonLedgerIngestionEngine,
    options: HorizonLedgerIngestionWorkerOptions = {}
  ) {
    this.horizonUrl = (options.horizonUrl ?? process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org').replace(
      /\/$/,
      ''
    );
    this.batchSize = options.batchSize ?? 50;
    this.fetchFn = options.fetchFn ?? fetch;
    this.startSequence = options.startSequence;
  }

  /**
   * Runs exactly one poll tick: fetch the next batch of ledgers after the
   * current cursor, ingest each in ascending order, and return a summary.
   * Never throws for an individual ledger's ingestion failure — logs and
   * continues, so one bad ledger can't wedge the whole batch; a thrown
   * error here means fetching from Horizon itself failed.
   */
  async pollOnce(): Promise<PollResult> {
    const last = await this.engine.getLastIngestedLedger();
    const afterSequence = last ? last.sequence : await this.resolveStartSequence();

    const ledgers = await this.fetchLedgers(afterSequence, this.batchSize);

    let ledgersIngested = 0;
    let reorgsDetected = 0;
    let lastSequence: number | null = last?.sequence ?? null;

    for (const ledger of ledgers) {
      try {
        const payments = await this.fetchPaymentsForLedger(ledger.sequence);
        const result = await this.engine.ingestLedger(ledger, payments);
        if (result.status === 'reorg-rolled-back') reorgsDetected++;
        if (result.status !== 'duplicate') ledgersIngested++;
        lastSequence = ledger.sequence;
      } catch (err) {
        logger.error('[HorizonLedgerIngestionWorker] Failed to ingest ledger', {
          sequence: ledger.sequence,
          error: (err as Error).message,
        });
      }
    }

    return { ledgersFetched: ledgers.length, ledgersIngested, reorgsDetected, lastSequence };
  }

  /**
   * Starts continuous polling on a fixed interval. Overlap-guarded: if a
   * tick is still running when the next one is due, that tick is skipped
   * rather than run concurrently (avoids two ticks racing on the same
   * cursor within a single process — the cross-process race is handled
   * separately by the engine's Postgres advisory lock).
   */
  start(intervalMs = 5_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.polling) {
      logger.debug('[HorizonLedgerIngestionWorker] Skipping tick — previous poll still in flight');
      return;
    }
    this.polling = true;
    try {
      const result = await this.pollOnce();
      if (result.ledgersFetched > 0) {
        logger.info('[HorizonLedgerIngestionWorker] Poll tick complete', result);
      }
    } catch (err) {
      logger.error('[HorizonLedgerIngestionWorker] Poll tick failed', err as Error);
    } finally {
      this.polling = false;
    }
  }

  // ── Horizon HTTP helpers ────────────────────────────────────────────────

  private async resolveStartSequence(): Promise<number> {
    if (this.startSequence !== undefined) return this.startSequence;

    const response = await this.fetchFn(`${this.horizonUrl}/ledgers?order=desc&limit=1`);
    if (!response.ok) {
      throw new Error(`Failed to resolve latest Horizon ledger: HTTP ${response.status}`);
    }
    const page = (await response.json()) as HorizonCollectionPage<HorizonLedgerApiRecord>;
    const latest = page._embedded.records[0];
    // Start one behind "latest" so the very next poll ingests at least one
    // real ledger instead of always trailing by a full batch.
    return latest ? latest.sequence - 1 : 0;
  }

  private async fetchLedgers(afterSequence: number, limit: number): Promise<StellarLedgerRecord[]> {
    const url = `${this.horizonUrl}/ledgers?cursor=${encodeURIComponent(String(afterSequence))}&order=asc&limit=${limit}`;
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Horizon /ledgers request failed: HTTP ${response.status}`);
    }
    const page = (await response.json()) as HorizonCollectionPage<HorizonLedgerApiRecord>;
    return page._embedded.records.map((r) => ({
      sequence: r.sequence,
      hash: r.hash,
      prevHash: r.prev_hash,
      closedAt: r.closed_at,
    }));
  }

  private async fetchPaymentsForLedger(sequence: number): Promise<StellarPaymentRecord[]> {
    const url = `${this.horizonUrl}/ledgers/${sequence}/operations?limit=200`;
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Horizon /ledgers/${sequence}/operations request failed: HTTP ${response.status}`);
    }
    const page = (await response.json()) as HorizonCollectionPage<HorizonPaymentApiRecord>;
    return page._embedded.records
      .filter((r) => PAYMENT_OPERATION_TYPES.has(r.type))
      .map((r) => ({
        id: r.id,
        type: r.type,
        transactionHash: r.transaction_hash,
        sourceAccount: r.source_account,
        from: r.from,
        to: r.to,
        assetType: r.asset_type,
        assetCode: r.asset_code,
        amount: r.amount,
        createdAt: r.created_at,
      }));
  }
}
