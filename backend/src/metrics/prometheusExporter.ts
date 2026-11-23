/**
 * Prometheus Exporter — Issue BE-013
 *
 * Lightweight in-process registry for the operational metrics produced by the
 * OpenTelemetry tracing pipeline (HTTP server latency, tracing overhead, queue
 * job duration and Pub/Sub message throughput). Rendered in the standard
 * Prometheus text exposition format (version 0.0.4) and appended to the
 * existing `/api/v1/metrics/prometheus` scrape payload.
 *
 * Kept dependency-free on purpose: recording a sample is a couple of array
 * writes, so the per-request cost stays far below the 1.5ms tracing budget.
 */

/** Metric name prefix, shared with MetricsExporter. */
const PREFIX = 'w3sl';

type Labels = Record<string, string>;

/** Default latency buckets in seconds (1ms … 10s). */
export const DEFAULT_LATENCY_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** Fine-grained buckets for the tracing overhead histogram (50µs … 5ms). */
export const OVERHEAD_BUCKETS = [0.00005, 0.0001, 0.00025, 0.0005, 0.001, 0.0015, 0.0025, 0.005];

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',')}}`;
}

function labelKey(labels: Labels): string {
  return JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
}

function formatValue(value: number): string {
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

interface HistogramSeries {
  labels: Labels;
  bucketCounts: number[];
  sum: number;
  count: number;
}

export class Histogram {
  private readonly series = new Map<string, HistogramSeries>();

  constructor(
    readonly name: string,
    readonly help: string,
    private readonly buckets: number[] = DEFAULT_LATENCY_BUCKETS,
  ) {}

  observe(labels: Labels, value: number): void {
    const key = labelKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { labels, bucketCounts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.series.set(key, entry);
    }
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= this.buckets[i]!) entry.bucketCounts[i]! += 1;
    }
    entry.sum += value;
    entry.count += 1;
  }

  reset(): void {
    this.series.clear();
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const entry of this.series.values()) {
      this.buckets.forEach((le, i) => {
        lines.push(
          `${this.name}_bucket${renderLabels({ ...entry.labels, le: formatValue(le) })} ${entry.bucketCounts[i]}`,
        );
      });
      lines.push(`${this.name}_bucket${renderLabels({ ...entry.labels, le: '+Inf' })} ${entry.count}`);
      lines.push(`${this.name}_sum${renderLabels(entry.labels)} ${entry.sum}`);
      lines.push(`${this.name}_count${renderLabels(entry.labels)} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

export class Counter {
  private readonly series = new Map<string, { labels: Labels; value: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}, amount = 1): void {
    const key = labelKey(labels);
    const entry = this.series.get(key);
    if (entry) {
      entry.value += amount;
    } else {
      this.series.set(key, { labels, value: amount });
    }
  }

  reset(): void {
    this.series.clear();
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const entry of this.series.values()) {
      lines.push(`${this.name}${renderLabels(entry.labels)} ${entry.value}`);
    }
    return lines.join('\n');
  }
}

// ─── Registered metric families ───────────────────────────────────────────────

export const httpServerDuration = new Histogram(
  `${PREFIX}_http_server_request_duration_seconds`,
  'Duration of inbound HTTP requests, by method, normalised route and status class.',
);

export const tracingOverhead = new Histogram(
  `${PREFIX}_tracing_overhead_seconds`,
  'Time spent inside the tracing middleware itself per request (budget: 1.5ms).',
  OVERHEAD_BUCKETS,
);

export const queueJobDuration = new Histogram(
  `${PREFIX}_queue_job_duration_seconds`,
  'Duration of traced BullMQ job executions, by queue and outcome.',
);

export const pubsubMessages = new Counter(
  `${PREFIX}_pubsub_messages_total`,
  'Redis Pub/Sub messages carrying trace context, by channel and direction.',
);

const families: Array<Histogram | Counter> = [httpServerDuration, tracingOverhead, queueJobDuration, pubsubMessages];

/** Render every tracing-related metric family as Prometheus text exposition. */
export function renderTracingPrometheus(): string {
  return `${families.map((family) => family.render()).join('\n')}\n`;
}

/** Clear all recorded samples (tests / admin reset). */
export function resetTracingMetrics(): void {
  for (const family of families) family.reset();
}
