import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import {
  LearningMetrics,
  TimeSpentPoint,
  generateMockMetrics,
  generateMockTimeSpent,
  normalizeMetrics,
} from '@/lib/analytics/performanceMetrics';

/**
 * usePerformanceMetrics — fetches a student's learning-performance snapshot.
 *
 * Integrates with the existing analytics infrastructure: it hits the same
 * `/analytics/user/:id` (or `/analytics/overview`) endpoints used by
 * {@link useAnalytics}, then normalises the payload into the strongly-typed
 * `LearningMetrics` shape the dashboard understands.
 *
 * Error handling / fallbacks (per the acceptance criteria): if the request
 * fails — common in local dev where the backend may be offline — we surface the
 * error *and* fall back to deterministic mock data so the dashboard still
 * renders something useful instead of a blank screen.
 */
export interface PerformanceMetricsResult {
  metrics: LearningMetrics;
  timeSpent: TimeSpentPoint[];
  isLoading: boolean;
  /** Non-null when the live fetch failed and mock data is being shown. */
  error: Error | null;
  /** True when the displayed data is mock fallback rather than live. */
  isFallback: boolean;
}

export function usePerformanceMetrics(userId?: string): PerformanceMetricsResult {
  const [metrics, setMetrics] = useState<LearningMetrics>(generateMockMetrics);
  const [timeSpent, setTimeSpent] = useState<TimeSpentPoint[]>(() => generateMockTimeSpent());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const response = await apiClient.get(
          userId ? `/analytics/user/${userId}` : '/analytics/overview'
        );
        if (cancelled) return;
        const payload = response.data ?? {};
        setMetrics(normalizeMetrics(payload.performance ?? payload));
        if (Array.isArray(payload.timeSpent) && payload.timeSpent.length > 0) {
          setTimeSpent(payload.timeSpent as TimeSpentPoint[]);
        }
        setError(null);
        setIsFallback(false);
      } catch (err) {
        if (cancelled) return;
        // Graceful degradation: keep the mock data already in state.
        setError(err as Error);
        setIsFallback(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { metrics, timeSpent, isLoading, error, isFallback };
}
