# Monitoring runbooks

One section per alert in `prometheus/alert.rules.yml`. Each alert's
`runbook_url` links to its heading here.

## ApiErrorRateHigh

5xx responses exceed 1% of all responses for 30 seconds (with at least 0.1 req/s traffic).

1. Check the 5xx breakdown: `sum by (status_class) (rate(w3sl_http_responses_total[5m]))`.
2. Check worker and error types: `GET /api/v1/metrics/prometheus` and review `w3sl_errors_total` by `type`.
3. Check backend logs for `Unhandled error` entries and recent deploys.
4. If a dependency is down (see DB and RPC alerts), resolve that first.

## ApiP95LatencyHigh

p95 request duration exceeds 1500 ms over 5 minutes.

1. Confirm with `histogram_quantile(0.95, sum by (le) (rate(w3sl_http_request_duration_milliseconds_bucket[5m])))`.
2. Compare with `w3sl_db_pool_utilization_percent`. Pool saturation is the usual cause.
3. Check slow routes in logs (requests over 1 s are logged as `Slow request`).

## DbPoolUtilizationHigh

Database pool utilisation is above 85% of `DB_POOL_MAX`.

1. The value updates on each DB health check, so confirm checks are running.
2. Look for long-running queries: `SELECT pid, state, now() - query_start AS age, left(query, 120) FROM pg_stat_activity WHERE datname = current_database() ORDER BY age DESC;`
3. Check for a traffic burst, and raise `DB_POOL_MAX` only after confirming the database has headroom.

## RpcProbeFailureRateHigh

The deep-readiness ledger probe (`probe="horizon_ledger"`) fails more than 5% of the time.

Note: this probe currently calls Horizon's ledgers endpoint, not Soroban RPC.

1. Check the Horizon status page and `HORIZON_URL` in the environment.
2. Check outbound connectivity from the backend pod.
3. Check the probe failure count: `sum by (outcome) (rate(w3sl_external_probe_total{probe="horizon_ledger"}[5m]))`.

## SorobanIndexerLagHigh

`soroban_indexer_ledger_lag_seconds{indexer="soroban-events"}` is above 15s
(about 3 ledgers at a 5s close interval) for 2 minutes.

1. Confirm the current lag: `soroban_indexer_ledger_lag_seconds`.
2. Check backend logs for `Stream indexer poll failed` — a failing Soroban RPC
   makes the indexer fall behind while the HTTP API stays healthy.
3. Verify the RPC head is advancing: `GET /health/ready` reports
   `latestLedgerHeight`, and `w3sl_external_probe_total{probe="horizon_ledger"}` shows probe outcomes.
4. If lag grows without bound, restart the indexer worker; the cursor is
   checkpointed in Redis (`indexer:checkpoint:*`) so it resumes without data loss.

## BullmqQueueDepthHigh

The sum of `bullmq_queue_waiting_jobs_count` for a queue is above 500 for 5
minutes (2000 and a critical severity for `BullmqQueueDepthCritical`).

1. Identify the saturated queue: `sum by (queue) (bullmq_queue_waiting_jobs_count)`.
2. Check worker health and throughput: `GET /api/v1/metrics/prometheus` exposes
   `w3sl_worker_up` and `w3sl_worker_jobs_failed_total`.
3. Check Redis latency/reachability — the exporter keeps the last sample on a
   failed refresh, so a stale timestamp plus a flat line points at Redis.
4. Scale the relevant worker (`MINTING_WORKER_CONCURRENCY`,
   `EVALUATION_WORKER_CONCURRENCY`, …) only after confirming the downstream
   rate limit (for example `SOROBAN_RPC_MAX_SUBMISSIONS_PER_SEC`) has headroom.

## WasmEvaluationLatencyHigh

p95 sandboxed WASM evaluation duration is above 1.5s for 10 minutes.

1. Confirm: `histogram_quantile(0.95, sum by (le) (rate(wasm_evaluation_duration_seconds_bucket[5m])))`.
2. Break it down by outcome with `sum by (status, termination_reason) (rate(wasm_evaluation_duration_seconds_count[5m]))`.
   A rise in `termination_reason="timeout"` means hostile or pathological
   submissions, not host overload.
3. Check host CPU saturation and `WASM_SANDBOX_MAX_CONCURRENCY`; the sandbox
   caps concurrent isolates per process.

## MetricsScrapeTargetDown

Prometheus reports `up{job="web3-student-lab-backend"} == 0` for 5 minutes.

1. Confirm the endpoint responds: `curl -u "$PROMETHEUS_BASIC_AUTH_USER:$PROMETHEUS_BASIC_AUTH_PASSWORD" https://<host>/metrics`.
2. A `401` means the scrape configuration credentials no longer match
   `PROMETHEUS_BASIC_AUTH_USER` / `PROMETHEUS_BASIC_AUTH_PASSWORD`.
3. A `503` means the credentials are unset in production; set them and restart.
4. If `curl` succeeds from outside the cluster but Prometheus fails, check the
   ServiceMonitor/scrape target and network policy.
