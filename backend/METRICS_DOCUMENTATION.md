# Metrics & Monitoring

The backend exports aggregated in-process metrics in a form monitoring systems
can consume without manual parsing.

## Endpoints

| Endpoint | Format | Purpose |
| --- | --- | --- |
| `GET /api/v1/metrics/prometheus` | `text/plain; version=0.0.4` | Scrape target. Stable names, units in the name. |
| `GET /api/v1/metrics/snapshot` | JSON (`schemaVersion: "1"`) | Same aggregation for JSON-only tooling. |
| `GET /api/v1/metrics` | JSON | Legacy summary shape. |
| `GET /api/v1/metrics/performance` | JSON | Retained per-request samples (ring buffer). |
| `GET /api/v1/metrics/errors` | JSON | Error entries with **messages redacted**. |
| `GET /api/v1/metrics/business` | JSON | Domain event entries. |
| `POST /api/v1/metrics` | `text/plain` JSON | Rate-limited browser Web Vitals span ingestion. |
| `POST /api/v1/metrics/reset` | JSON | Clears counters (admin/manual use). |
| `GET /api/v1/cache/metrics` | JSON | Cache hit/miss plus backend reachability. |

### Authorization and rate control

Operational read and reset endpoints require the monitoring secret
`METRICS_AUTH_TOKEN`, sent as either header:

```
X-Metrics-Token: <token>
Authorization: Bearer <token>
```

Comparison is constant-time. If `METRICS_AUTH_TOKEN` is unset the endpoints stay
open in development and test but return `503 SERVICE_UNAVAILABLE` in production,
so a deployed instance is never unprotected. Scrapes are rate limited to
`METRICS_RATE_LIMIT` requests/minute per identity (default 120). Failures use the
standard [error envelope](./API_ERROR_CONTRACT.md).

Browser telemetry ingestion is intentionally unauthenticated so page visitors
can report vitals without exposing the monitoring secret. It has a separate
`CLIENT_METRICS_RATE_LIMIT` per-IP limit (default 120/minute), accepts at most
20 spans and 16 KiB per request, and retains only allowlisted metric, route,
device-capability and interaction-target attributes. It records `client.web_vital`,
`client.route_change` and `client.slow_interaction` business events. INP above
200 ms includes an interaction target to help identify the slow component.
The frontend sends this data through OpenTelemetry spans using `sendBeacon`,
with a keepalive fetch fallback.

Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: web3-student-lab-api
    scrape_interval: 30s
    metrics_path: /api/v1/metrics/prometheus
    static_configs:
      - targets: ['api.internal:8080']
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/w3sl-metrics-token
```

## Prometheus scrape endpoint (BE-077)

`GET /metrics` (root path, not under `/api/v1`) is the conventional scrape
target. It is rendered by `prom-client` from the registry in
`src/metrics/prometheusMetrics.ts` and protected by **HTTP basic auth**:

```yaml
scrape_configs:
  - job_name: web3-student-lab-backend
    scrape_interval: 30s
    metrics_path: /metrics
    basic_auth:
      username: prometheus
      password_file: /etc/prometheus/w3sl-metrics-password
    static_configs:
      - targets: ['api.internal:8080']
```

Credentials are read from `PROMETHEUS_BASIC_AUTH_USER` and
`PROMETHEUS_BASIC_AUTH_PASSWORD`. If either is unset the endpoint stays open in
development/test but returns `503 SERVICE_UNAVAILABLE` in production, so a
deployed instance is never silently unprotected. Responses carry
`Content-Type: text/plain; version=0.0.4; charset=utf-8`.

Queue depth needs a Redis round-trip, so it is sampled at most once every
`PROMETHEUS_QUEUE_METRICS_TTL_MS` (default 10000) and bounded by
`PROMETHEUS_QUEUE_METRICS_TIMEOUT_MS` (default 1500). A failed refresh keeps
the previous sample instead of hanging or failing the scrape.

### Custom metrics exposed at /metrics

| Metric | Type | Labels | Description |
| --- | --- | --- | --- |
| `soroban_indexer_ledger_lag_seconds` | gauge | `indexer` | Seconds the Soroban event indexer trails the network ledger head. Computed from the newest event applied per poll, with `LEDGER_CLOSE_INTERVAL_SECONDS` (default 5) per ledger. |
| `bullmq_queue_waiting_jobs_count` | gauge | `queue` | Jobs waiting to be picked up, per managed queue and the dead-letter queue. |
| `wasm_evaluation_duration_seconds` | histogram | `status`, `termination_reason` | Wall-clock duration of sandboxed WASM grading runs (buckets 10ms–10s). |
| `http_request_duration_seconds` | histogram | `method`, `route`, `status_class` | Inbound request latency. `route` is the matched Express pattern (`/api/v1/certificates/:id`), or `(unmatched)`; it is never a raw URL. |

Node.js process metrics (`nodejs_*`) are collected into the same registry.
The pre-existing `w3sl_*` families remain on
`/api/v1/metrics/prometheus`; both endpoints can be scraped, or use `/metrics`
for everything named here.

### Dashboards and alerts

- Grafana: `monitoring/grafana/dashboards/backend-prometheus-exporter.json`
  (indexer lag, queue saturation, WASM p95/outcomes, HTTP rate and latency).
- Alerts: `monitoring/prometheus/alert.rules.yml`, group
  `web3-student-lab-prometheus-exporter` — indexer lag > 15s (3 ledgers),
  queue depth > 500 (warning) / > 2000 (critical), WASM p95 > 1.5s, and
  scrape-target down.
- Response steps: `monitoring/runbooks.md` sections `SorobanIndexerLagHigh`,
  `BullmqQueueDepthHigh`, `WasmEvaluationLatencyHigh`,
  `MetricsScrapeTargetDown`.

## Exported metrics

All names are prefixed `w3sl_`. Counters are monotonic per process lifetime.

| Metric | Type | Unit | Description |
| --- | --- | --- | --- |
| `w3sl_cache_backend_up{mode}` | gauge | boolean | 1 = cache backend reachable, 0 = unreachable. `mode` is `standalone`/`cluster`/`sentinel`. |
| `w3sl_cache_hits_total` | counter | lookups | Lookups served from cache. |
| `w3sl_cache_misses_total` | counter | lookups | Lookups that missed. |
| `w3sl_cache_hit_ratio` | gauge | ratio 0–1 | Hit ratio over the process lifetime. |
| `w3sl_http_requests_total{method,route}` | counter | requests | Requests by method and **normalised** route. |
| `w3sl_http_responses_total{status_class}` | counter | responses | Responses by `2xx`/`4xx`/`5xx`. |
| `w3sl_http_request_duration_milliseconds_avg` | gauge | ms | Mean duration over retained samples. |
| `w3sl_errors_total{type}` | counter | errors | Errors by type/class name. `type="all"` is the total. |
| `w3sl_business_events_total{event}` | counter | events | Domain events, e.g. `certificate.minted`. |
| `w3sl_worker_up{worker,state}` | gauge | boolean | 1 = running, 0 = stopped/degraded. |
| `w3sl_worker_jobs_completed_total{worker}` | counter | jobs | Jobs completed per worker. |
| `w3sl_worker_jobs_failed_total{worker}` | counter | jobs | Jobs failed per worker. |
| `w3sl_process_uptime_seconds` | gauge | seconds | Process uptime. |
| `w3sl_process_resident_memory_bytes` | gauge | bytes | Node heap usage. |
| `w3sl_process_cpu_user_seconds_total` | counter | seconds | User CPU time. |

Known `worker` labels: `storage-pin`, `storage-gc`, `webhook-delivery`.

### What is deliberately excluded

- Request and response bodies, query strings and headers.
- User, student and wallet identifiers — route labels have identifier-looking
  segments rewritten to `:id` (`/certificates/4242` → `/certificates/:id`), which
  also keeps label cardinality bounded.
- Error *messages*. Only the error type is exported; the full message and stack
  live in the logs, correlated by the `requestId` from the error envelope.
- Business event metadata (only the event name and count are exported).

## Dashboards

**API health**
1. Request rate — `sum(rate(w3sl_http_requests_total[5m]))`
2. Error ratio — `sum(rate(w3sl_http_responses_total{status_class="5xx"}[5m])) / sum(rate(w3sl_http_responses_total[5m]))`
3. Mean latency — `w3sl_http_request_duration_milliseconds_avg`
4. Top routes — `topk(10, sum by (route) (rate(w3sl_http_requests_total[5m])))`

**Cache health**
1. `w3sl_cache_backend_up` as a status tile
2. `w3sl_cache_hit_ratio` trend
3. Lookup rate — `rate(w3sl_cache_hits_total[5m])` vs `rate(w3sl_cache_misses_total[5m])`

**Workers**
1. `w3sl_worker_up` per worker as status tiles
2. Failure rate — `rate(w3sl_worker_jobs_failed_total[15m])`
3. Throughput — `rate(w3sl_worker_jobs_completed_total[15m])`

**Process**: uptime (restart detection), resident memory, CPU seconds.

## Alert-worthy signals

| Alert | Condition | Severity |
| --- | --- | --- |
| Cache backend down | `w3sl_cache_backend_up == 0` for 2m | critical |
| Elevated 5xx | 5xx ratio > 2% for 5m | critical |
| Latency regression | `w3sl_http_request_duration_milliseconds_avg > 1000` for 10m | warning |
| Cache hit ratio collapse | `w3sl_cache_hit_ratio < 0.5` for 15m (with non-trivial lookup rate) | warning |
| Worker down | `w3sl_worker_up == 0` for 5m while the app is up | critical |
| Worker failures | `rate(w3sl_worker_jobs_failed_total[15m]) > 0.1` | warning |
| Memory growth | `w3sl_process_resident_memory_bytes` up >50% over 1h with flat traffic | warning |
| Frequent restarts | `w3sl_process_uptime_seconds` resets more than twice in 30m | warning |
| Scrape failure | target down for 5m | warning |

When an alert fires, take the correlation ID from the affected request's error
envelope (or the log entry) and search the logs — metrics intentionally carry no
request detail.

## Implementation notes

Counters are per-process and in memory: they reset on restart, and with multiple
instances each one must be scraped separately (aggregate in the monitoring
system). Retained raw samples are bounded to 10,000 entries per category
(ring buffer) in `src/metrics/MetricsCollector.ts`.

- `src/metrics/MetricsExporter.ts` — snapshot + Prometheus rendering
- `src/metrics/WorkerRegistry.ts` — worker liveness and job counters
- `src/middleware/metricsAuth.ts` — monitoring token check
- `tests/metricsExporter.test.ts` — schema, label safety and auth tests
