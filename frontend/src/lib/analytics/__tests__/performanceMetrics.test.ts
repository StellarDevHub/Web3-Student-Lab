import { describe, it, expect } from 'vitest';
import {
  computeCompletionRate,
  formatDuration,
  evaluateAchievements,
  countEarnedBadges,
  toAnalyticsError,
  createMetricsExport,
  type LearningMetrics,
  type AnalyticsError,
} from '../performanceMetrics';

const base: LearningMetrics = {
  coursesCompleted: 6,
  coursesEnrolled: 12,
  totalTimeSpentMinutes: 150,
  currentStreakDays: 7,
  averageScore: 92,
};

describe('performanceMetrics', () => {
  it('computes completion rate and guards divide-by-zero', () => {
    expect(computeCompletionRate(base)).toBe(50);
    expect(computeCompletionRate({ ...base, coursesEnrolled: 0 })).toBe(0);
  });

  it('formats durations', () => {
    expect(formatDuration(150)).toBe('2h 30m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(45)).toBe('45m');
  });

  it('evaluates achievements against the metrics snapshot', () => {
    const badges = evaluateAchievements(base);
    const earned = countEarnedBadges(badges);
    expect(badges.length).toBeGreaterThan(0);
    // first-steps, halfway-there, consistent (7d), high-achiever (>=90) earned;
    // finisher (100%) and time-scholar (>=600m) not.
    expect(earned).toBe(4);
    expect(badges.find((b) => b.id === 'finisher')?.earned).toBe(false);
  });

  describe('toAnalyticsError', () => {
    it('classifies a network failure as retriable', () => {
      const error = Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        code: 'ERR_NETWORK',
        response: undefined,
      });
      expect(toAnalyticsError(error)).toEqual({
        code: 'NETWORK_ERROR',
        message: 'Network Error',
        retriable: true,
      });
    });

    it('classifies a timeout as retriable', () => {
      const error = Object.assign(new Error('timeout of 5000ms exceeded'), {
        isAxiosError: true,
        code: 'ECONNABORTED',
        response: undefined,
      });
      expect(toAnalyticsError(error)).toEqual({
        code: 'TIMEOUT',
        message: 'timeout of 5000ms exceeded',
        retriable: true,
      });
    });

    it('marks 5xx responses as retriable and 4xx as not', () => {
      const five = Object.assign(new Error('Service Unavailable'), {
        isAxiosError: true,
        response: { status: 503 },
      });
      const four = Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
      expect(toAnalyticsError(five).retriable).toBe(true);
      expect(toAnalyticsError(five).code).toBe('HTTP_503');
      expect(toAnalyticsError(four).retriable).toBe(false);
      expect(toAnalyticsError(four).status).toBe(404);
    });

    it('uses the server-provided message when present', () => {
      const error = Object.assign(new Error('Request failed with status code 400'), {
        isAxiosError: true,
        response: { status: 400, data: { message: 'Invalid cohort id' } },
      });
      expect(toAnalyticsError(error).message).toBe('Invalid cohort id');
    });

    it('passes structured errors through unchanged', () => {
      const structured: AnalyticsError = {
        code: 'HTTP_500',
        message: 'boom',
        retriable: true,
        status: 500,
      };
      expect(toAnalyticsError(structured)).toBe(structured);
    });

    it('wraps unknown errors as non-retriable', () => {
      expect(toAnalyticsError('kaput')).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'Unexpected analytics error',
        retriable: false,
      });
    });
  });

  describe('createMetricsExport', () => {
    it('labels live exports as live', () => {
      const exportedAt = '2026-07-31T12:00:00.000Z';
      const payload = createMetricsExport(base, { state: 'live', lastVerifiedAt: exportedAt }, exportedAt);
      expect(payload.isLive).toBe(true);
      expect(payload.source).toBe('live');
      expect(payload.lastVerifiedAt).toBe(exportedAt);
      expect(payload.exportedAt).toBe(exportedAt);
      expect(payload.metrics).toEqual(base);
    });

    it('labels cached exports as non-live with provenance', () => {
      const lastVerifiedAt = '2026-07-31T09:00:00.000Z';
      const payload = createMetricsExport(base, { state: 'cached', lastVerifiedAt }, lastVerifiedAt);
      expect(payload.isLive).toBe(false);
      expect(payload.source).toBe('cached');
      expect(payload.lastVerifiedAt).toBe(lastVerifiedAt);
    });

    it('labels fallback exports as non-live', () => {
      const payload = createMetricsExport(base, { state: 'fallback', lastVerifiedAt: null });
      expect(payload.isLive).toBe(false);
      expect(payload.source).toBe('fallback');
      expect(payload.lastVerifiedAt).toBeNull();
    });
  });
});
