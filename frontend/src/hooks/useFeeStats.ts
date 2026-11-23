'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  FeeStats,
  LEDGER_CLOSE_SECONDS,
  TESTNET_HORIZON_URL,
  fetchFeeStats,
} from '@/lib/stellarFeeStats';

/**
 * Poll Horizon `/fee_stats` for live Stellar fee-market data (Issue #1156).
 *
 * Polls one ledger-close apart by default: Horizon recomputes these stats per
 * ledger, so anything faster is the same numbers at extra cost.
 *
 * The interval is cleared on unmount and every in-flight request is aborted, so
 * the chart that consumes this leaks neither timers nor sockets — the "zero
 * memory leaks" line in the acceptance criteria.
 */
export interface UseFeeStatsOptions {
  horizonUrl?: string;
  /** Poll interval in ms. Defaults to one ledger close (5s). */
  intervalMs?: number;
  /** Start polling immediately. Defaults to true. */
  enabled?: boolean;
}

export interface UseFeeStatsResult {
  stats: FeeStats | null;
  /** True only while the very first request is outstanding. */
  loading: boolean;
  error: string | null;
  /** Epoch millis of the last successful poll. */
  updatedAt: number | null;
  refresh: () => void;
}

export function useFeeStats({
  horizonUrl = TESTNET_HORIZON_URL,
  intervalMs = LEDGER_CLOSE_SECONDS * 1000,
  enabled = true,
}: UseFeeStatsOptions = {}): UseFeeStatsResult {
  const [stats, setStats] = useState<FeeStats | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    // A slow poll must not outlive the one replacing it.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const next = await fetchFeeStats(horizonUrl, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return;
      setStats(next);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      // Keep the last good stats on screen; a dropped poll is not a reason to
      // blank a chart the student is reading.
      setError(err instanceof Error ? err.message : 'Failed to reach Horizon');
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [horizonUrl]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    void load();
    const timer = setInterval(() => void load(), intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [enabled, intervalMs, load]);

  return { stats, loading, error, updatedAt, refresh: () => void load() };
}
