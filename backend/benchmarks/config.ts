/**
 * Benchmark scenario configuration for the playground compiler endpoints.
 *
 * Each scenario is a self-contained load test: which endpoint to flood, what
 * payload to send, how many concurrent connections to open, and for how long.
 * The runner (`runBenchmarks.ts`) executes these with autocannon and reports
 * latency + success ratios via the pure stats module (`lib/stats.ts`).
 *
 * Tune scenarios with environment variables (so CI and local runs differ
 * without code changes):
 *   BENCH_BASE_URL     base API url      (default http://localhost:8080/api/v1)
 *   BENCH_WORKSPACE_ID x-workspace-id    (default "default")
 *   BENCH_CONNECTIONS  override concurrency for the peak scenario
 *   BENCH_DURATION     override duration (seconds) for every scenario
 */

/** Pass/fail thresholds applied to a scenario's results. */
export interface BenchmarkThresholds {
  /** Minimum fraction of 2xx responses (0–1) for the scenario to pass. */
  minSuccessRatio: number;
  /** Maximum tolerated p99 latency in milliseconds. */
  maxP99LatencyMs: number;
}

/** A single load-test scenario. */
export interface BenchmarkScenario {
  name: string;
  description: string;
  /** Path appended to the base url, e.g. "/contracts/compile". */
  path: string;
  method: 'GET' | 'POST';
  /** Concurrent open connections (the load). */
  connections: number;
  /** Test duration in seconds. */
  duration: number;
  /** Requests pipelined per connection. */
  pipelining?: number;
  /** JSON body sent with each request (stringified by the runner). */
  body?: unknown;
  thresholds: BenchmarkThresholds;
}

/** Resolve the base URL from the environment, with a sensible local default. */
export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.BENCH_BASE_URL ?? 'http://localhost:8080/api/v1';
}

/** Resolve the workspace id header value. */
export function resolveWorkspaceId(env: NodeJS.ProcessEnv = process.env): string {
  return env.BENCH_WORKSPACE_ID ?? 'default';
}

/** Headers sent with every benchmarked request. */
export function resolveHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-workspace-id': resolveWorkspaceId(env),
  };
}

// A minimal but valid Soroban contract (>= 32 chars) that satisfies
// contractCompileSchema, so the compiler does real work under load.
const SAMPLE_SOURCE = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};

#[contract]
pub struct BenchContract;

#[contractimpl]
impl BenchContract {
    pub fn ping(_env: Env) -> Symbol {
        symbol_short!("pong")
    }
}`;

const COMPILE_BODY = {
  sourceCode: SAMPLE_SOURCE,
  compilerVersion: '0.8.10',
  optimization: true,
  target: 'soroban',
  entryPoint: 'ping',
};

/** Apply BENCH_CONNECTIONS / BENCH_DURATION overrides to a number. */
function override(value: number, envVar: string | undefined): number {
  const parsed = envVar ? Number(envVar) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : value;
}

/** Build the scenario list, honouring environment overrides. */
export function buildScenarios(env: NodeJS.ProcessEnv = process.env): BenchmarkScenario[] {
  const duration = (d: number) => override(d, env.BENCH_DURATION);

  return [
    {
      name: 'compile-warmup',
      description: 'Light warm-up load to prime the compiler endpoint.',
      path: '/contracts/compile',
      method: 'POST',
      connections: 5,
      duration: duration(5),
      body: COMPILE_BODY,
      thresholds: { minSuccessRatio: 0.99, maxP99LatencyMs: 1500 },
    },
    {
      name: 'compile-peak',
      description: 'Simulated load peak flooding the compiler endpoint.',
      path: '/contracts/compile',
      method: 'POST',
      connections: override(50, env.BENCH_CONNECTIONS),
      duration: duration(20),
      pipelining: 1,
      body: COMPILE_BODY,
      thresholds: { minSuccessRatio: 0.97, maxP99LatencyMs: 4000 },
    },
    {
      name: 'compile-sustained',
      description: 'Sustained moderate load to observe steady-state latency.',
      path: '/contracts/compile',
      method: 'POST',
      connections: 20,
      duration: duration(30),
      body: COMPILE_BODY,
      thresholds: { minSuccessRatio: 0.98, maxP99LatencyMs: 3000 },
    },
  ];
}

export const scenarios = buildScenarios();
