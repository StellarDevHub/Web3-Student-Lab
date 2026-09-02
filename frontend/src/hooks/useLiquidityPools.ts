'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  PoolReserves,
  TESTNET_HORIZON_URL,
  fetchLiquidityPools,
} from '@/lib/liquidityPool';

/**
 * Load live Stellar liquidity pool reserves (Issue #1157).
 *
 * Reserves move per ledger, but the yield maths reads them as a snapshot, so
 * this refreshes on a slower cadence than the fee-market poller and lets the
 * student refresh by hand.
 */
export interface UseLiquidityPoolsResult {
  pools: PoolReserves[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLiquidityPools(
  horizonUrl: string = TESTNET_HORIZON_URL,
  refreshMs = 30_000,
): UseLiquidityPoolsResult {
  const [pools, setPools] = useState<PoolReserves[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const next = await fetchLiquidityPools(horizonUrl, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return;
      setPools(next);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to reach Horizon');
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [horizonUrl]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const timer = setInterval(() => void load(), refreshMs);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load, refreshMs]);

  return { pools, loading, error, refresh: () => void load() };
}
