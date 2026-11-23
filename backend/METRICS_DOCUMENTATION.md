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
| `POST /api/v1/metrics/reset` | JSON | Clears counters (admin/manual use). |
| `GET /api/v1/cache/metrics` | JSON | Cache hit/miss plus backend reachability. |

### Authorization and rate control

All of the above require the monitoring secret `METRICS_AUTH_TOKEN`, sent as
either header:

```
X-Metrics-Token: <token>
Authorization: Bearer <token>
```

Comparison is constant-time. If `METRICS_AUTH_TOKEN` is unset the endpoints stay
open in development and test but return `503 SERVICE_UNAVAILABLE` in production,
so a deployed instance is never unprotected. Scrapes are rate limited to
`METRICS_RATE_LIMIT` requests/minute per identity (default 120). Failures use the
standard [error envelope](./API_ERROR_CONTRACT.md).

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
