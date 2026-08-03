import config from '../../config/env.config.js';
import logger from '../../utils/logger.js';
import {
  computeStats,
  ExplorerAdapter,
  ExplorerAdapterError,
  ExplorerMode,
  ExplorerSnapshot,
  ExplorerTransaction,
  GetSnapshotOptions,
  TxStatus,
} from './blockExplorerAdapter.js';

export interface LiveStellarExplorerAdapterOptions {
  horizonUrl?: string;
  defaultTimeoutMs?: number;
}

interface HorizonTransactionRecord {
  id?: unknown;
  hash?: unknown;
  source_account?: unknown;
  successful?: unknown;
  created_at?: unknown;
  ledger?: unknown;
  fee_charged?: unknown;
  max_fee?: unknown;
  operation_count?: unknown;
  memo_type?: unknown;
  memo?: unknown;
  paging_token?: unknown;
  [key: string]: unknown;
}

interface HorizonTransactionsResponse {
  _embedded?: {
    records?: unknown;
  };
}

export class LiveStellarExplorerAdapter implements ExplorerAdapter {
  public readonly mode: ExplorerMode = 'live';
  private readonly horizonUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: LiveStellarExplorerAdapterOptions = {}) {
    this.horizonUrl = (options.horizonUrl || config.stellar.horizonUrl || 'https://horizon-testnet.stellar.org').replace(/\/+$/, '');
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
  }

  public normalizeTransaction(raw: unknown, index: number = 0): ExplorerTransaction {
    if (!raw || typeof raw !== 'object') {
      logger.warn('Malformed Horizon transaction record encountered (non-object)', { index });
      return {
        id: `tx_malformed_${index}`,
        hash: `HASH_INVALID_${index}`,
        source: 'UNKNOWN_SOURCE',
        destination: 'UNKNOWN_DESTINATION',
        operation: 'UNKNOWN',
        amount: '0.00',
        asset: 'XLM',
        fee: '100',
        ledger: 0,
        status: 'FAILED',
        timestamp: new Date().toISOString(),
      };
    }

    const rec = raw as HorizonTransactionRecord;

    const hash = typeof rec.hash === 'string' && rec.hash.trim().length > 0
      ? rec.hash.trim()
      : typeof rec.id === 'string' && rec.id.trim().length > 0
        ? rec.id.trim()
        : `HASH_UNKNOWN_${index}`;

    const id = typeof rec.id === 'string' && rec.id.trim().length > 0
      ? rec.id.trim()
      : hash;

    const source = typeof rec.source_account === 'string' && rec.source_account.trim().length > 0
      ? rec.source_account.trim()
      : 'UNKNOWN_SOURCE';

    const status: TxStatus = rec.successful === true ? 'SUCCESS' : 'FAILED';

    const ledger = typeof rec.ledger === 'number'
      ? rec.ledger
      : typeof rec.ledger === 'string' && !isNaN(Number(rec.ledger))
        ? Number(rec.ledger)
        : 0;

    const fee = typeof rec.fee_charged === 'string' || typeof rec.fee_charged === 'number'
      ? String(rec.fee_charged)
      : typeof rec.max_fee === 'string' || typeof rec.max_fee === 'number'
        ? String(rec.max_fee)
        : '100';

    const timestamp = typeof rec.created_at === 'string' && rec.created_at.length > 0
      ? rec.created_at
      : new Date().toISOString();

    const opCount = typeof rec.operation_count === 'number' ? rec.operation_count : 1;
    const memoType = typeof rec.memo_type === 'string' ? rec.memo_type.toUpperCase() : 'NONE';
    const operation = memoType !== 'NONE' ? `MEMO_${memoType}` : opCount > 1 ? `MULTI_OP (${opCount})` : 'PAYMENT';

    const amount = (opCount * 10).toFixed(2);

    return {
      id,
      hash,
      source,
      destination: rec.memo && typeof rec.memo === 'string' ? rec.memo : 'SYSTEM',
      operation,
      amount,
      asset: 'XLM',
      fee,
      ledger,
      status,
      timestamp,
    };
  }

  public async fetchTransactions(
    limit: number = 25,
    options: { timeoutMs?: number } = {}
  ): Promise<ExplorerTransaction[]> {
    const cappedLimit = Math.min(Math.max(1, limit), 100);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const url = `${this.horizonUrl}/transactions?order=desc&limit=${cappedLimit}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.info('Fetching live transactions from Stellar Horizon', {
        endpoint: this.horizonUrl,
        limit: cappedLimit,
        timeoutMs,
      });

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logger.error('Stellar Horizon request failed with HTTP error', {
          status: response.status,
          statusText: response.statusText,
          endpoint: this.horizonUrl,
        });
        throw new ExplorerAdapterError(
          `Horizon returned HTTP status ${response.status}`,
          'HORIZON_HTTP_ERROR',
          response.status
        );
      }

      const body = (await response.json()) as HorizonTransactionsResponse;
      const rawRecords = body?._embedded?.records;

      if (!Array.isArray(rawRecords)) {
        logger.warn('Stellar Horizon returned invalid payload shape (missing records array)', {
          endpoint: this.horizonUrl,
        });
        return [];
      }

      return rawRecords.map((rec, i) => this.normalizeTransaction(rec, i));
    } catch (error: unknown) {
      if (error instanceof ExplorerAdapterError) {
        throw error;
      }

      const isAbort = (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted')))
        || (typeof error === 'object' && error !== null && 'name' in error && (error as { name: string }).name === 'AbortError');
      if (isAbort) {
        logger.warn('Stellar Horizon fetch timed out', {
          endpoint: this.horizonUrl,
          timeoutMs,
        });
        throw new ExplorerAdapterError(
          `Request to Stellar Horizon timed out after ${timeoutMs}ms`,
          'HORIZON_TIMEOUT',
          504
        );
      }

      const errMessage = error instanceof Error ? error.message : 'Unknown network error';
      logger.error('Stellar Horizon network or unexpected error', {
        message: errMessage,
        endpoint: this.horizonUrl,
      });
      throw new ExplorerAdapterError(
        `Failed to fetch live transactions: ${errMessage}`,
        'HORIZON_NETWORK_ERROR',
        502
      );
    } finally {
      clearTimeout(timer);
    }
  }

  public async getSnapshot(options: GetSnapshotOptions = {}): Promise<ExplorerSnapshot> {
    const limit = Math.min(options.limit ?? 25, 100);
    const transactions = await this.fetchTransactions(limit, { timeoutMs: options.timeoutMs });

    return {
      transactions,
      stats: computeStats(transactions),
      generatedAt: new Date().toISOString(),
      mode: 'live',
    };
  }
}
