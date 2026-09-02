import {
  computeStats,
  ExplorerAdapter,
  ExplorerMode,
  ExplorerSnapshot,
  ExplorerTransaction,
  GetSnapshotOptions,
  TxStatus,
} from './blockExplorerAdapter.js';

const OPS = ['PAYMENT', 'INVOKE_HOST_FUNCTION', 'CHANGE_TRUST', 'MANAGE_OFFER', 'CREATE_ACCOUNT'];
const ASSETS = ['XLM', 'USDC', 'EURC', 'AQUA'];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export class SimulationExplorerAdapter implements ExplorerAdapter {
  public readonly mode: ExplorerMode = 'simulation';

  public async fetchTransactions(
    limit: number = 25,
    options: { timeoutMs?: number; seed?: number } = {}
  ): Promise<ExplorerTransaction[]> {
    const cappedLimit = Math.min(Math.max(1, limit), 100);
    const seed = options.seed ?? 42;
    const rand = seededRandom(seed);
    const startLedger = 524000;

    return Array.from({ length: cappedLimit }, (_, i) => {
      const status: TxStatus = rand() > 0.08 ? 'SUCCESS' : 'FAILED';
      const ledger = startLedger + Math.floor(rand() * 5);
      return {
        id: `tx_${seed}_${i}`,
        hash: `H${seed.toString(16).padStart(8, '0')}${i.toString(16).padStart(8, '0')}`,
        source: `G${Math.floor(rand() * 1e10).toString(36).toUpperCase().padStart(10, '0')}`,
        destination: `G${Math.floor(rand() * 1e10).toString(36).toUpperCase().padStart(10, '0')}`,
        operation: OPS[Math.floor(rand() * OPS.length)] ?? 'PAYMENT',
        amount: (rand() * 1000).toFixed(2),
        asset: ASSETS[Math.floor(rand() * ASSETS.length)] ?? 'XLM',
        fee: (100 + Math.floor(rand() * 900)).toString(),
        ledger,
        status,
        timestamp: new Date(Date.now() - i * 60_000).toISOString(),
      };
    });
  }

  public async getSnapshot(options: GetSnapshotOptions = {}): Promise<ExplorerSnapshot> {
    const limit = Math.min(options.limit ?? 25, 100);
    const seed = options.seed ?? Math.floor(Date.now() / 60_000);
    const transactions = await this.fetchTransactions(limit, { seed });

    return {
      transactions,
      stats: computeStats(transactions),
      generatedAt: new Date().toISOString(),
      mode: 'simulation',
    };
  }
}
