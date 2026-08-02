# Automated Performance Benchmark Suite

Load-tests the playground **compiler endpoints** under simulated traffic peaks
and reports latency + success ratios, using [autocannon](https://github.com/mcollina/autocannon).

## What it does

- Floods `POST /api/v1/contracts/compile` (and is easily extended to other
  endpoints) with concurrent connections across several scenarios.
- Measures latency percentiles (mean/p50/p90/p99/max), throughput, and the
  ratio of `2xx` responses to total attempts.
- Checks each scenario against pass/fail thresholds and writes statistical logs
  (JSON + text) to `benchmarks/results/`.
- Exits non-zero if any scenario misses its thresholds (CI-gating friendly).

## Layout

| File | Responsibility |
|------|----------------|
| `config.ts` | Scenario definitions (endpoint, payload, connections, duration, thresholds) + env overrides. |
| `lib/stats.ts` | Pure stats/reporting: `summarize`, `formatSummary`, success-ratio + threshold logic. Unit tested. |
| `runBenchmarks.ts` | Thin runner: drives autocannon per scenario and persists logs. |
| `results/` | Generated logs (git-ignored). |

The number-crunching lives in `lib/stats.ts` with **no autocannon/network
dependency**, so it is unit-tested deterministically in
`tests/benchmark-stats.test.ts` without running a load test.

## Running

```bash
cd backend
npm install                 # installs autocannon (added as a devDependency)
npm run start &             # start the API under test (or: npm run dev)
npm run bench               # run all scenarios against http://localhost:8080/api/v1
```

### Environment overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| `BENCH_BASE_URL` | `http://localhost:8080/api/v1` | API base url. |
| `BENCH_WORKSPACE_ID` | `default` | Value for the required `x-workspace-id` header. |
| `BENCH_CONNECTIONS` | `50` (peak) | Concurrency for the peak scenario. |
| `BENCH_DURATION` | per-scenario | Override duration (seconds) for all scenarios. |

```bash
BENCH_CONNECTIONS=150 BENCH_DURATION=10 npm run bench
```

## Sample output

```
[PASS] compile-peak
  duration:     20s @ 50 connections
  requests:     10000 total (500/s)
  latency (ms):  mean 120 | p50 100 | p90 200 | p99 900 | max 1500
  responses:    2xx 9990 | non2xx 10 | errors 0 | timeouts 0
  success:      99.9%
```

## Tests

```bash
cd backend
npm test -- benchmark-stats
```
