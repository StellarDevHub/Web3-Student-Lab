export type ExplorerMode = 'live' | 'simulation';

export type TxStatus = 'SUCCESS' | 'PENDING' | 'FAILED';

export interface ExplorerTransaction {
  id: string;
  hash: string;
  source: string;
  destination: string;
  operation: string;
  amount: string;
  asset: string;
  fee: string;
  ledger: number;
  status: TxStatus;
  timestamp: string;
}

export interface ExplorerSnapshotStats {
  totalTransactions: number;
  successRate: number;
  averageFee: string;
  latestLedger: number;
}

export interface ExplorerSnapshot {
  transactions: ExplorerTransaction[];
  stats: ExplorerSnapshotStats;
  generatedAt: string;
  mode?: ExplorerMode;
}

export interface GetSnapshotOptions {
  limit?: number;
  seed?: number;
  timeoutMs?: number;
  network?: string;
  cacheTtl?: number;
  useSimulation?: boolean;
  mode?: ExplorerMode;
}

export interface ExplorerAdapter {
  readonly mode: ExplorerMode;
  getSnapshot(options?: GetSnapshotOptions): Promise<ExplorerSnapshot>;
  fetchTransactions(limit?: number, options?: { timeoutMs?: number; seed?: number }): Promise<ExplorerTransaction[]>;
}

export class ExplorerAdapterError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'EXPLORER_ADAPTER_ERROR', statusCode: number = 500) {
    super(message);
    this.name = 'ExplorerAdapterError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function computeStats(txs: ExplorerTransaction[]): ExplorerSnapshotStats {
  if (txs.length === 0) {
    return { totalTransactions: 0, successRate: 0, averageFee: '0', latestLedger: 0 };
  }
  const succeeded = txs.filter((t) => t.status === 'SUCCESS').length;
  const totalFee = txs.reduce((sum, t) => sum + (Number(t.fee) || 0), 0);
  const maxLedger = txs.reduce((max, t) => Math.max(max, t.ledger || 0), 0);
  return {
    totalTransactions: txs.length,
    successRate: Math.round((succeeded / txs.length) * 100),
    averageFee: (totalFee / txs.length).toFixed(0),
    latestLedger: maxLedger,
  };
}
