'use client';

import { getItem, setItem } from '@/lib/localStorage';
import {
  MAX_FEE_BID,
  MIN_FEE_BID,
  MinedBlock,
  PendingTx,
  randomTx,
  selectForBlock,
  totalGas,
  txPriorityFee,
} from '@/lib/mempool';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'mempool_auction_state';

export interface MempoolSettings {
  /** Gas ceiling per block. */
  gasLimit: number;
  /** Network base fee (gwei); bids below it are ineligible. */
  baseFee: number;
}

interface PersistedState {
  pool: PendingTx[];
  blocks: MinedBlock[];
  settings: MempoolSettings;
  nextHeight: number;
}

export const DEFAULT_SETTINGS: MempoolSettings = {
  gasLimit: 1_500_000,
  baseFee: 12,
};

function defaultState(): PersistedState {
  return { pool: [], blocks: [], settings: DEFAULT_SETTINGS, nextHeight: 1_000_001 };
}

function clampFee(value: number): number {
  return Math.min(MAX_FEE_BID, Math.max(MIN_FEE_BID, Math.round(value)));
}

export function useMempoolSimulator() {
  const [pool, setPool] = useState<PendingTx[]>([]);
  const [blocks, setBlocks] = useState<MinedBlock[]>([]);
  const [settings, setSettings] = useState<MempoolSettings>(DEFAULT_SETTINGS);
  const [autoFlow, setAutoFlow] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const nextHeight = useRef(defaultState().nextHeight);

  // Load persisted state once on mount (client only).
  useEffect(() => {
    const stored = getItem<PersistedState>(STORAGE_KEY, defaultState());
    setPool(stored.pool);
    setBlocks(stored.blocks);
    setSettings({ ...DEFAULT_SETTINGS, ...stored.settings });
    nextHeight.current = stored.nextHeight ?? defaultState().nextHeight;
    setHydrated(true);
  }, []);

  // Persist whenever the simulation changes (after hydration to avoid clobbering).
  useEffect(() => {
    if (!hydrated) return;
    setItem<PersistedState>(STORAGE_KEY, {
      pool,
      blocks,
      settings,
      nextHeight: nextHeight.current,
    });
  }, [hydrated, pool, blocks, settings]);

  const addTransaction = useCallback((tx?: PendingTx) => {
    setPool((prev) => [tx ?? randomTx(Date.now()), ...prev].slice(0, 60));
  }, []);

  const removeTransaction = useCallback((id: string) => {
    setPool((prev) => prev.filter((tx) => tx.id !== id));
  }, []);

  /** Update a single transaction's fee bid — the lever that re-sorts the pool. */
  const setFeeBid = useCallback((id: string, feeBid: number) => {
    setPool((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, feeBid: clampFee(feeBid) } : tx)),
    );
  }, []);

  const updateSettings = useCallback((patch: Partial<MempoolSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Build the next block: pack the highest bidders that fit, then drop them. */
  const mineBlock = useCallback(() => {
    setPool((prevPool) => {
      const included = selectForBlock(prevPool, settings.gasLimit, settings.baseFee);
      if (included.length === 0) return prevPool;

      const includedIds = new Set(included.map((tx) => tx.id));
      const block: MinedBlock = {
        height: nextHeight.current,
        transactions: included,
        gasUsed: totalGas(included),
        gasLimit: settings.gasLimit,
        baseFee: settings.baseFee,
        totalFees: included.reduce((sum, tx) => sum + txPriorityFee(tx, settings.baseFee), 0),
        minedAt: Date.now(),
      };
      nextHeight.current += 1;
      setBlocks((prev) => [block, ...prev].slice(0, 12));

      return prevPool.filter((tx) => !includedIds.has(tx.id));
    });
  }, [settings.gasLimit, settings.baseFee]);

  const reset = useCallback(() => {
    const fresh = defaultState();
    setPool(fresh.pool);
    setBlocks(fresh.blocks);
    setSettings(fresh.settings);
    nextHeight.current = fresh.nextHeight;
    setAutoFlow(false);
  }, []);

  // Auto-flow: simulate organic mempool influx.
  useEffect(() => {
    if (!autoFlow) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.4) addTransaction();
    }, 1200);
    return () => clearInterval(interval);
  }, [autoFlow, addTransaction]);

  return {
    pool,
    blocks,
    settings,
    autoFlow,
    hydrated,
    addTransaction,
    removeTransaction,
    setFeeBid,
    updateSettings,
    mineBlock,
    reset,
    setAutoFlow,
  };
}
