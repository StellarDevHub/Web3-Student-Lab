import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeBackoffDelayMs,
  DEFAULT_POLL_INTERVAL_MS,
  fetchHorizonHealthMetrics,
  NetworkTelemetryMetrics,
} from '../services/stellar/horizonHealth';

export interface UseNetworkTelemetryOptions {
  horizonUrl?: string;
  pollIntervalMs?: number;
  enabled?: boolean;
  fetcher?: (horizonUrl: string) => Promise<NetworkTelemetryMetrics>;
}

export interface UseNetworkTelemetryState {
  metrics: NetworkTelemetryMetrics | null;
  loading: boolean;
  error: string | null;
  retryCount: number;
  nextPollDelayMs: number;
  isHighLatency: boolean;
  refresh: () => Promise<void>;
}

export function useNetworkTelemetry(
  options: UseNetworkTelemetryOptions = {}
): UseNetworkTelemetryState {
  const {
    horizonUrl = 'https://horizon.stellar.org',
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    enabled = true,
    fetcher = fetchHorizonHealthMetrics,
  } = options;

  const [metrics, setMetrics] = useState<NetworkTelemetryMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const retryCountRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollOnce = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcher(horizonUrl);
      setMetrics(result);
      setError(null);
      retryCountRef.current = 0;
      setRetryCount(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network telemetry error';
      setError(message);
      retryCountRef.current += 1;
      setRetryCount(retryCountRef.current);
    } finally {
      setLoading(false);
    }
  }, [fetcher, horizonUrl]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const scheduleNext = async () => {
      await pollOnce();
      if (cancelled) return;
      const delay = computeBackoffDelayMs(retryCountRef.current, pollIntervalMs);
      timerRef.current = setTimeout(scheduleNext, delay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, pollIntervalMs, pollOnce]);

  const nextPollDelayMs = computeBackoffDelayMs(retryCount, pollIntervalMs);

  return {
    metrics,
    loading,
    error,
    retryCount,
    nextPollDelayMs,
    isHighLatency: Boolean(metrics?.isHighLatency),
    refresh: pollOnce,
  };
}
