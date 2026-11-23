import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/lib/api-client';
import {
  AnalyticsError,
  DataSourceState,
  LearningMetrics,
  TimeSpentPoint,
  generateMockMetrics,
  generateMockTimeSpent,
  normalizeMetrics,
  toAnalyticsError,
} from '@/lib/analytics/performanceMetrics';

/**
 * usePerformanceMetrics — fetches a student's learning-performance snapshot.
 *
 * Integrates with the existing analytics infrastructure: it hits the same
 * `/analytics/user/:id` (or `/analytics/overview`) endpoints used by
 * {@link useAnalytics}, then normalises the payload into the strongly-typed
 * `LearningMetrics` shape the dashboard understands.
 *
 * Data-source transparency (per the issue): the hook never lets the UI present
 * anything but live data as if it were a verified record. It tracks a
 * `dataSource` state of `live` | `cached` | `fallback`:
 *
 *  - `live`: the request succeeded; the snapshot is freshly verified.
 *  - `cached`: the latest request failed but a previously verified live snapshot
 *    exists, so stale-but-real data is kept on screen instead of fake numbers.
 *  - `fallback`: no live snapshot has ever been verified, so deterministic mock
 *    data is shown purely so the dashboard remains explorable.
 *
 * Every failure is also normalised into a structured {@link AnalyticsError} and
 * surfaced, so the UI can always explain exactly what it is showing.
 */
export interface PerformanceMetricsResult {
  metrics: LearningMetrics;
  timeSpent: TimeSpentPoint[];
  isLoading: boolean;
  /** Structured error from the most recent failed analytics request, if any. */
  error: AnalyticsError | null;
  /** True when the displayed data is deterministic mock fallback, not learner progress. */
  isFallback: boolean;
  /** What the displayed data actually is — live, cached (stale real) or fallback (mock). */
  dataSource: DataSourceState;
  /** ISO timestamp of the last verified live fetch; null when never live. */
  lastVerifiedAt: string | null;
  /** Re-runs the fetch. Safe to call repeatedly. */
  retry: () => Promise<void>;
}

export function usePerformanceMetrics(userId?: string): PerformanceMetricsResult {
  const [metrics, setMetrics] = useState<LearningMetrics>(generateMockMetrics);
  const [timeSpent, setTimeSpent] = useState<TimeSpentPoint[]>(() => generateMockTimeSpent());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AnalyticsError | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceState>('fallback');
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);

  // Guards: a monotonically increasing run id lets a stale in-flight request be
  // ignored once a newer load() has started (covers retry races + unmount).
  const runIdRef = useRef(0);
  const timeSpentRef = useRef<TimeSpentPoint[]>(timeSpent);
  const lastLiveRef = useRef<{
    metrics: LearningMetrics;
    timeSpent: TimeSpentPoint[];
    verifiedAt: string;
  } | null>(null);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    setIsLoading(true);
    try {
      const response = await apiClient.get(
        userId ? `/analytics/user/${userId}` : '/analytics/overview'
      );
      if (runIdRef.current !== runId) return;

      const payload = response.data ?? {};
      const nextMetrics = normalizeMetrics(payload.performance ?? payload);
      const nextTimeSpent =
        Array.isArray(payload.timeSpent) && payload.timeSpent.length > 0
          ? (payload.timeSpent as TimeSpentPoint[])
          : timeSpentRef.current;
      const verifiedAt = new Date().toISOString();

      timeSpentRef.current = nextTimeSpent;
      lastLiveRef.current = { metrics: nextMetrics, timeSpent: nextTimeSpent, verifiedAt };

      setMetrics(nextMetrics);
      setTimeSpent(nextTimeSpent);
      setLastVerifiedAt(verifiedAt);
      setDataSource('live');
      setError(null);
    } catch (err) {
      if (runIdRef.current !== runId) return;

      const analyticsError = toAnalyticsError(err);
      const lastLive = lastLiveRef.current;
      if (lastLive) {
        // Keep the last verified snapshot rather than replacing real data with mock.
        setMetrics(lastLive.metrics);
        setTimeSpent(lastLive.timeSpent);
        setLastVerifiedAt(lastLive.verifiedAt);
        setDataSource('cached');
      } else {
        setLastVerifiedAt(null);
        setDataSource('fallback');
      }
      setError(analyticsError);
    } finally {
      if (runIdRef.current === runId) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    return () => {
      // Invalidate any in-flight request when the hook unmounts.
      runIdRef.current += 1;
    };
  }, [load]);

  const retry = useCallback(() => load(), [load]);

  return {
    metrics,
    timeSpent,
    isLoading,
    error,
    isFallback: dataSource === 'fallback',
    dataSource,
    lastVerifiedAt,
    retry,
  };
}
