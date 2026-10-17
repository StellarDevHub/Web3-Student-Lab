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
