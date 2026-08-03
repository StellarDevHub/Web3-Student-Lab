/**
 * Block Explorer Service — Hackathon Project Idea Generator backend.
 *
 * Provides ledger snapshots and transaction feeds for hackathon research using typed adapters.
 */

import cacheService from '../cache/CacheService.js';
import logger from '../utils/logger.js';
import {
  ExplorerAdapter,
  ExplorerAdapterError,
  ExplorerMode,
  ExplorerSnapshot,
  ExplorerTransaction,
  GetSnapshotOptions,
  TxStatus,
} from './adapters/blockExplorerAdapter.js';
import { getExplorerAdapter, resolveExplorerMode } from './adapters/explorerAdapterFactory.js';
import { LiveStellarExplorerAdapter } from './adapters/liveStellarExplorerAdapter.js';
import { SimulationExplorerAdapter } from './adapters/simulationExplorerAdapter.js';

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

export interface ExplorerSnapshot {
  transactions: ExplorerTransaction[];
  stats: {
    totalTransactions: number;
    successRate: number;
    averageFee: string;
    latestLedger: number;
  };
  generatedAt: string;
}

const OPS = ['PAYMENT', 'INVOKE_HOST_FUNCTION', 'CHANGE_TRUST', 'MANAGE_OFFER', 'CREATE_ACCOUNT'];
const ASSETS = ['XLM', 'USDC', 'EURC', 'AQUA'];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pick<T>(options: readonly T[], rand: () => number): T {
  const idx = Math.min(options.length - 1, Math.floor(rand() * options.length));
  return options[idx] as T;
}

function generateTransactions(count: number, seed: number, startLedger: number): ExplorerTransaction[] {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const status: TxStatus = rand() > 0.08 ? 'SUCCESS' : 'FAILED';
    const ledger = startLedger + Math.floor(rand() * 5);
    return {
      id: `tx_${seed}_${i}`,
      hash: `H${seed.toString(16).padStart(8, '0')}${i.toString(16).padStart(8, '0')}`,
      source: `G${Math.floor(rand() * 1e10).toString(36).toUpperCase().padStart(10, '0')}`,
      destination: `G${Math.floor(rand() * 1e10).toString(36).toUpperCase().padStart(10, '0')}`,
      operation: pick(OPS, rand),
      amount: (rand() * 1000).toFixed(2),
      asset: pick(ASSETS, rand),
      fee: (100 + Math.floor(rand() * 900)).toString(),
      ledger,
      status,
      timestamp: new Date(Date.now() - i * 60_000).toISOString(),
    };
  });
}

function computeStats(txs: ExplorerTransaction[]): ExplorerSnapshot['stats'] {
  if (txs.length === 0) {
    return { totalTransactions: 0, successRate: 0, averageFee: '0', latestLedger: 0 };
  }
  const succeeded = txs.filter((t) => t.status === 'SUCCESS').length;
  const totalFee = txs.reduce((sum, t) => sum + Number(t.fee), 0);
  return {
    totalTransactions: txs.length,
    successRate: Math.round((succeeded / txs.length) * 100),
    averageFee: (totalFee / txs.length).toFixed(0),
    latestLedger: Math.max(...txs.map((t) => t.ledger)),
  };
}

export {
  ExplorerAdapter,
  ExplorerAdapterError,
  ExplorerMode,
  GetSnapshotOptions,
  LiveStellarExplorerAdapter,
  SimulationExplorerAdapter,
};

export function filterTransactions(
  txs: ExplorerTransaction[],
  query: string
): ExplorerTransaction[] {
  const q = query.trim().toLowerCase();
  if (!q) return txs;
  return txs.filter(
    (tx) =>
      tx.hash.toLowerCase().includes(q) ||
      tx.operation.toLowerCase().includes(q) ||
      tx.source.toLowerCase().includes(q) ||
      tx.destination.toLowerCase().includes(q) ||
      tx.asset.toLowerCase().includes(q)
  );
}

export async function getExplorerSnapshot(
  options: GetSnapshotOptions = {}
): Promise<ExplorerSnapshot> {
  const limit = Math.min(options.limit ?? 25, 100);
  const seed = options.seed ?? Math.floor(Date.now() / 60_000);
  const resolvedMode = resolveExplorerMode(options);
  const cacheKey = `hackathon:explorer:${resolvedMode}:${seed}:${limit}`;

  const cached = await cacheService.get<ExplorerSnapshot>(cacheKey);
  if (cached) return cached;

  let adapter = getExplorerAdapter(options);

  try {
    const snapshot = await adapter.getSnapshot(options);
    await cacheService.set(cacheKey, snapshot, options.cacheTtl ?? 120);
    return snapshot;
  } catch (error: unknown) {
    // Operational signal fallback: if live adapter fails (network/timeout), attempt fallback to simulation if allowed or log structured telemetry
    const allowFallback = process.env.EXPLORER_FALLBACK_TO_SIMULATION === 'true' || options.useSimulation === true;
    if (resolvedMode === 'live' && allowFallback) {
      logger.warn('Live Stellar explorer fetch failed; falling back to simulation adapter', {
        error: error instanceof Error ? error.message : String(error),
        seed,
        limit,
      });
      const simAdapter = new SimulationExplorerAdapter();
      const fallbackSnapshot = await simAdapter.getSnapshot({ ...options, mode: 'simulation' });
      return fallbackSnapshot;
    }

    logger.error('Block explorer service error fetching snapshot', {
      mode: resolvedMode,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function buildExplorerLink(
  hash: string,
  network: 'testnet' | 'public' = 'testnet'
): string {
  const segment = network === 'public' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${segment}/tx/${hash}`;
}
