import {
  allPassed,
  computeSuccessRatio,
  formatSummary,
  summarize,
  totalAttempts,
  type AutocannonResultLike,
} from '../benchmarks/lib/stats.js';
import type { BenchmarkThresholds } from '../benchmarks/config.js';

const thresholds: BenchmarkThresholds = { minSuccessRatio: 0.97, maxP99LatencyMs: 4000 };

const healthyResult: AutocannonResultLike = {
  duration: 20,
  connections: 50,
  latency: { mean: 120, p50: 100, p90: 200, p99: 900, max: 1500 },
  requests: { total: 10000, mean: 500 },
  '2xx': 9990,
  non2xx: 10,
  errors: 0,
  timeouts: 0,
};

describe('benchmark stats', () => {
  describe('totalAttempts / computeSuccessRatio', () => {
    it('counts 2xx, non2xx, errors and timeouts', () => {
      expect(totalAttempts(healthyResult)).toBe(10000);
      expect(computeSuccessRatio(healthyResult)).toBeCloseTo(0.999, 3);
    });

    it('returns 0 (no NaN) when there are no attempts', () => {
      expect(totalAttempts({})).toBe(0);
      expect(computeSuccessRatio({})).toBe(0);
    });

    it('treats transport errors and timeouts as failures', () => {
      const result: AutocannonResultLike = { '2xx': 50, errors: 25, timeouts: 25 };
      expect(computeSuccessRatio(result)).toBe(0.5);
    });
  });

  describe('summarize', () => {
    it('marks a healthy run as passed', () => {
      const summary = summarize('compile-peak', healthyResult, thresholds);
      expect(summary.passed).toBe(true);
      expect(summary.failures).toEqual([]);
      expect(summary.totalRequests).toBe(10000);
      expect(summary.requestsPerSec).toBe(500);
      expect(summary.latencyMs.p99).toBe(900);
    });

    it('fails when success ratio is below threshold', () => {
      const summary = summarize(
        'compile-peak',
        { '2xx': 80, non2xx: 20, latency: { p99: 100 } },
        thresholds
      );
      expect(summary.passed).toBe(false);
      expect(summary.failures.join(' ')).toMatch(/success ratio/);
    });

    it('fails when p99 latency exceeds the threshold', () => {
      const summary = summarize(
        'compile-peak',
        { '2xx': 100, latency: { p99: 9000 } },
        thresholds
      );
      expect(summary.passed).toBe(false);
      expect(summary.failures.join(' ')).toMatch(/p99 latency/);
    });

    it('handles a missing latency object without throwing', () => {
      const summary = summarize('compile-peak', { '2xx': 100 }, thresholds);
      expect(summary.latencyMs).toEqual({ mean: 0, p50: 0, p90: 0, p99: 0, max: 0 });
      expect(summary.passed).toBe(true);
    });
  });

  describe('formatSummary / allPassed', () => {
    it('renders a readable PASS block', () => {
      const text = formatSummary(summarize('compile-warmup', healthyResult, thresholds));
      expect(text).toContain('[PASS] compile-warmup');
      expect(text).toContain('latency (ms)');
      expect(text).toContain('success:');
    });

    it('aggregates pass/fail across scenarios', () => {
      const pass = summarize('a', healthyResult, thresholds);
      const fail = summarize('b', { '2xx': 1, errors: 99, latency: { p99: 1 } }, thresholds);
      expect(allPassed([pass])).toBe(true);
      expect(allPassed([pass, fail])).toBe(false);
      expect(allPassed([])).toBe(false);
    });
  });
});
