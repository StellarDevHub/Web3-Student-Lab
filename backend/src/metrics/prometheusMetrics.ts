/**
 * Prometheus custom metrics exporter — Issue BE-077 (#1824).
 *
 * A `prom-client` registry dedicated to the operational signals that the
 * generic metrics collector cannot answer:
 *
 *   - `soroban_indexer_ledger_lag_seconds` — how far the Soroban event
 *     indexer head trails the network ledger head.
 *   - `bullmq_queue_waiting_jobs_count` — saturated background queues.
 *   - `wasm_evaluation_duration_seconds` — sandboxed WASM grading throughput.
 *   - `http_request_duration_seconds` — inbound request latency.
 *
 * The registry is separate from `prom-client`'s global one so requiring this
 * module always starts from a clean, predictable metric set (and so tests can
 * reset it without touching other instrumentation). The scrape endpoint lives
 * at `GET /metrics` in `routes/metrics.routes.ts`, behind basic auth.
 *
 * Metric names intentionally carry no prefix: they are the contract the
 * dashboards in `monitoring/grafana/dashboards/backend-prometheus-exporter.json`
 * and the alerts in `monitoring/prometheus/alert.rules.yml` query.
 */

import { Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Content type required by the Prometheus text exposition format. */
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

/** Average Stellar ledger close time; used to convert ledger lag to seconds. */
export const LEDGER_CLOSE_INTERVAL_SECONDS = Number(
  process.env.LEDGER_CLOSE_INTERVAL_SECONDS || '5'
);

export const prometheusRegistry = new Registry();

// Node/process defaults (CPU, memory, event-loop lag, GC) — the dashboards use
// them for capacity context alongside the custom metrics.
collectDefaultMetrics({ register: prometheusRegistry, prefix: 'nodejs_' });

/** Seconds the Soroban event indexer trails the network ledger head. */
export const sorobanIndexerLedgerLagSeconds = new Gauge({
  name: 'soroban_indexer_ledger_lag_seconds',
  help: 'Estimated lag between the Soroban event indexer head and the network ledger head, in seconds.',
  labelNames: ['indexer'] as const,
  registers: [prometheusRegistry],
});

/** Jobs pending (not yet picked up) per BullMQ queue. */
export const bullmqQueueWaitingJobsCount = new Gauge({
  name: 'bullmq_queue_waiting_jobs_count',
  help: 'Number of BullMQ jobs waiting to be processed, by queue.',
  labelNames: ['queue'] as const,
  registers: [prometheusRegistry],
});

/** Wall-clock duration of a sandboxed WASM evaluation run. */
export const wasmEvaluationDurationSeconds = new Histogram({
  name: 'wasm_evaluation_duration_seconds',
  help: 'Duration of sandboxed WASM evaluation runs, by outcome and termination reason.',
  labelNames: ['status', 'termination_reason'] as const,
  // Sandbox runs are bounded by a 2s wall clock; the tail buckets keep
  // startup/metering outliers (and timeouts) visible.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [prometheusRegistry],
});

/** Inbound HTTP request duration. */
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of inbound HTTP requests, by method, normalised route and status class.',
  labelNames: ['method', 'route', 'status_class'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [prometheusRegistry],
});

/**
 * Record indexer progress against the network head.
 *
 * A negative or non-finite difference is clamped to zero: an indexer that has
 * observed a ledger newer than the reported head (races between two RPC
 * replies) is caught up, not ahead by a negative lag.
 */
export function recordSorobanIndexerProgress(
  indexer: string,
  processedLedger: number,
  networkLedger: number
): void {
  if (!Number.isFinite(processedLedger) || !Number.isFinite(networkLedger)) return;
  const lagLedgers = Math.max(0, Math.floor(networkLedger) - Math.floor(processedLedger));
  sorobanIndexerLedgerLagSeconds.set(
    { indexer },
    lagLedgers * LEDGER_CLOSE_INTERVAL_SECONDS
  );
}

/** Set the indexer lag directly, in ledger units. */
export function recordSorobanIndexerLedgerLag(indexer: string, lagLedgers: number): void {
  if (!Number.isFinite(lagLedgers)) return;
  sorobanIndexerLedgerLagSeconds.set(
    { indexer },
    Math.max(0, lagLedgers) * LEDGER_CLOSE_INTERVAL_SECONDS
  );
}

/** Record one completed WASM evaluation. `durationSeconds` is wall-clock. */
export function recordWasmEvaluation(
  status: string,
  terminationReason: string,
  durationSeconds: number
): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return;
  wasmEvaluationDurationSeconds.observe(
    { status, termination_reason: terminationReason },
    durationSeconds
  );
}

/** Render the registry in Prometheus text exposition format. */
export function renderPrometheusMetrics(): Promise<string> {
  return prometheusRegistry.metrics();
}

/** Clear every exported sample (tests, admin reset). */
export function resetPrometheusMetrics(): void {
  prometheusRegistry.resetMetrics();
}
