/**
 * useBlockchainExplorer
 *
 * Hook for monitoring simulated blockchain transactions in real-time.
 * Uses a native WebSocket to stream transaction events from the explorer
 * WebSocket endpoint. Falls back to simulated data when no URL is provided
 * (useful for offline / educational use).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TxStatus = 'SUCCESS' | 'PENDING' | 'FAILED';
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

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

export interface ExplorerStats {
  totalTransactions: number;
  successRate: number;
  averageFee: string;
  latestLedger: number;
}

export interface UseBlockchainExplorerOptions {
  /** WebSocket URL to connect to. When omitted, simulated data is used. */
  wsUrl?: string;
  /** Maximum transactions to keep in memory. Default: 100 */
  maxTransactions?: number;
}

export interface UseBlockchainExplorerResult {
  transactions: ExplorerTransaction[];
  stats: ExplorerStats;
  connectionStatus: ConnectionStatus;
  error: string | null;
  isLive: boolean;
  toggleLive: () => void;
  clearTransactions: () => void;
}

// ─── Simulation helpers (used when no wsUrl is provided) ─────────────────────

const OPS = ['PAYMENT', 'MANAGE_OFFER', 'CHANGE_TRUST', 'INVOKE_HOST_FUNCTION', 'CREATE_ACCOUNT'];
const ASSETS = ['XLM', 'USDC', 'EURC', 'AQUA'];

function randomId(len = 8): string {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

function generateSimulatedTransaction(ledger: number): ExplorerTransaction {
  const status: TxStatus = Math.random() > 0.05 ? 'SUCCESS' : 'FAILED';
  return {
    id: randomId(),
    hash: randomId(16),
    source: 'G' + randomId(10),
    destination: 'G' + randomId(10),
    operation: OPS[Math.floor(Math.random() * OPS.length)],
    amount: (Math.random() * 1000).toFixed(2),
    asset: ASSETS[Math.floor(Math.random() * ASSETS.length)],
    fee: (100 + Math.floor(Math.random() * 900)).toString(),
    ledger,
    status,
    timestamp: new Date().toISOString(),
  };
}

function computeStats(txs: ExplorerTransaction[]): ExplorerStats {
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlockchainExplorer({
  wsUrl,
  maxTransactions = 100,
}: UseBlockchainExplorerOptions = {}): UseBlockchainExplorerResult {
  const [transactions, setTransactions] = useState<ExplorerTransaction[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ledgerRef = useRef(524000);

  const addTransactions = useCallback(
    (incoming: ExplorerTransaction[]) => {
      setTransactions((prev) => [...incoming, ...prev].slice(0, maxTransactions));
    },
    [maxTransactions]
  );

  const clearTransactions = useCallback(() => setTransactions([]), []);
  const toggleLive = useCallback(() => setIsLive((v) => !v), []);

  // ── WebSocket mode ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wsUrl || !isLive) return;

    setConnectionStatus('connecting');
    setError(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setConnectionStatus('error');
      setError('Invalid WebSocket URL.');
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => setConnectionStatus('connected');

    ws.onmessage = (event) => {
      try {
        const tx: ExplorerTransaction = JSON.parse(event.data as string);
        addTransactions([tx]);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      setConnectionStatus('error');
      setError('WebSocket connection error.');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
    };

    return () => {
      ws.close();
    };
  }, [wsUrl, isLive, addTransactions]);

  // ── Simulation mode (no wsUrl) ──────────────────────────────────────────────
  useEffect(() => {
    if (wsUrl || !isLive) return;

    setConnectionStatus('connected');

    intervalRef.current = setInterval(() => {
      if (Math.random() > 0.6) {
        ledgerRef.current += 1;
        const count = Math.floor(Math.random() * 5) + 1;
        const newTxs = Array.from({ length: count }, () =>
          generateSimulatedTransaction(ledgerRef.current)
        );
        addTransactions(newTxs);
      }
    }, 1200);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setConnectionStatus('disconnected');
    };
  }, [wsUrl, isLive, addTransactions]);

  const stats = computeStats(transactions);

  return { transactions, stats, connectionStatus, error, isLive, toggleLive, clearTransactions };
}
