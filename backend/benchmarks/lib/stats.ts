/**
 * Pure statistics & reporting helpers for the performance benchmark suite.
 *
 * These functions take an autocannon-style result object and turn it into a
 * normalised summary, a human-readable report, and a pass/fail verdict against
 * thresholds. They have **no I/O and no autocannon dependency**, so they can be
 * unit-tested deterministically without running a load test or a live server.
 */

import type { BenchmarkThresholds } from '../config.js';

/**
 * The subset of an autocannon result we consume. Autocannon returns much more,
 * but the suite only needs latency percentiles and response-class counts.
 * @see https://github.com/mcollina/autocannon#result
 */
export interface AutocannonResultLike {
  duration?: number;
  connections?: number;
  latency?: { mean?: number; p50?: number; p90?: number; p99?: number; max?: number };
  requests?: { total?: number; mean?: number };
  '1xx'?: number;
  '2xx'?: number;
  '3xx'?: number;
  '4xx'?: number;
  '5xx'?: number;
  non2xx?: number;
  errors?: number;
  timeouts?: number;
}

/** A normalised, report-ready summary of one scenario run. */
export interface BenchmarkSummary {
  name: string;
  durationSec: number;
  connections: number;
  totalRequests: number;
  requestsPerSec: number;
  latencyMs: { mean: number; p50: number; p90: number; p99: number; max: number };
  responses: { '2xx': number; non2xx: number; errors: number; timeouts: number };
  /** Fraction of attempts that returned 2xx (0–1). */
  successRatio: number;
  passed: boolean;
  /** Human-readable reasons when `passed` is false. */
  failures: string[];
}

function num(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Round to a fixed number of decimal places. */
function round(value: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/**
 * Total request attempts = successes + non-2xx + transport errors + timeouts.
 * Used as the denominator for the success ratio so failed connections count
 * against reliability, not just HTTP error responses.
 */
export function totalAttempts(result: AutocannonResultLike): number {
  return num(result['2xx']) + num(result.non2xx) + num(result.errors) + num(result.timeouts);
}

/** Success ratio (0–1): 2xx responses over all attempts. Zero attempts → 0. */
export function computeSuccessRatio(result: AutocannonResultLike): number {
  const total = totalAttempts(result);
  if (total === 0) return 0;
  return num(result['2xx']) / total;
}

/** Normalise an autocannon result into a {@link BenchmarkSummary}. */
export function summarize(
  name: string,
  result: AutocannonResultLike,
  thresholds: BenchmarkThresholds
): BenchmarkSummary {
  const successRatio = computeSuccessRatio(result);
  const latency = result.latency ?? {};
  const latencyMs = {
    mean: num(latency.mean),
    p50: num(latency.p50),
    p90: num(latency.p90),
    p99: num(latency.p99),
    max: num(latency.max),
  };

  const failures: string[] = [];
  if (successRatio < thresholds.minSuccessRatio) {
    failures.push(
      `success ratio ${round(successRatio * 100)}% < required ${round(
        thresholds.minSuccessRatio * 100
      )}%`
    );
  }
  if (latencyMs.p99 > thresholds.maxP99LatencyMs) {
    failures.push(`p99 latency ${latencyMs.p99}ms > max ${thresholds.maxP99LatencyMs}ms`);
  }

  return {
    name,
    durationSec: num(result.duration),
    connections: num(result.connections),
    totalRequests: num(result.requests?.total),
    requestsPerSec: round(num(result.requests?.mean)),
    latencyMs,
    responses: {
      '2xx': num(result['2xx']),
      non2xx: num(result.non2xx),
      errors: num(result.errors),
      timeouts: num(result.timeouts),
    },
    successRatio: round(successRatio, 4),
    passed: failures.length === 0,
    failures,
  };
}

/** Render a single summary as an aligned, human-readable log block. */
export function formatSummary(summary: BenchmarkSummary): string {
  const status = summary.passed ? 'PASS' : 'FAIL';
  const lines = [
    `[${status}] ${summary.name}`,
    `  duration:     ${summary.durationSec}s @ ${summary.connections} connections`,
    `  requests:     ${summary.totalRequests} total (${summary.requestsPerSec}/s)`,
    `  latency (ms):  mean ${summary.latencyMs.mean} | p50 ${summary.latencyMs.p50} | p90 ${summary.latencyMs.p90} | p99 ${summary.latencyMs.p99} | max ${summary.latencyMs.max}`,
    `  responses:    2xx ${summary.responses['2xx']} | non2xx ${summary.responses.non2xx} | errors ${summary.responses.errors} | timeouts ${summary.responses.timeouts}`,
    `  success:      ${round(summary.successRatio * 100)}%`,
  ];
  if (!summary.passed) {
    lines.push(`  threshold:    ${summary.failures.join('; ')}`);
  }
  return lines.join('\n');
}

/** True only if every scenario passed its thresholds. */
export function allPassed(summaries: BenchmarkSummary[]): boolean {
  return summaries.length > 0 && summaries.every((s) => s.passed);
}
