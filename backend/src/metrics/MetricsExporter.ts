/**
 * MetricsExporter — turns the in-memory metrics into a production-consumable
 * form: a stable JSON snapshot and a Prometheus text-exposition rendering.
 *
 * Design rules:
 *   - Stable names, explicit units in the name (`_seconds`, `_bytes`, `_total`).
 *   - Aggregates only. No request bodies, no user identifiers, no error
 *     messages — error metrics are keyed by error *type* alone.
 *   - Route labels are normalised (`/certificates/abc123` → `/certificates/:id`)
 *     so identifiers never reach the monitoring system and label cardinality
 *     stays bounded.
 */

import metricsCollector, { type MetricsSummary } from './MetricsCollector.js';
import workerRegistry, { type WorkerStatus } from './WorkerRegistry.js';
import cacheService from '../cache/CacheService.js';
import redisClient from '../cache/RedisClient.js';

/** Snapshot schema version. Bump on a breaking field change. */
export const METRICS_SCHEMA_VERSION = '1';

/** Metric name prefix for everything this exporter emits. */
const PREFIX = 'w3sl';

export interface CacheMetricsSnapshot {
  /** 1 when the cache backend is reachable, 0 otherwise. */
  backendUp: 0 | 1;
  backendMode: string;
  hitsTotal: number;
  missesTotal: number;
  /** Hit ratio in the range 0–1 (not a percentage). */
  hitRatio: number;
}

export interface HttpMetricsSnapshot {
  requestsTotal: number;
  averageDurationMilliseconds: number;
  /** Requests keyed by normalised `METHOD /route`. */
  requestsByRoute: Record<string, number>;
  /** Requests keyed by status class: `2xx`, `4xx`, `5xx`. */
  requestsByStatusClass: Record<string, number>;
}

export interface ErrorMetricsSnapshot {
  errorsTotal: number;
  /** Counts keyed by error type/class name only — never by message. */
  errorsByType: Record<string, number>;
}

export interface MetricsSnapshot {
  schemaVersion: string;
  collectedAt: string;
  cache: CacheMetricsSnapshot;
  http: HttpMetricsSnapshot;
  errors: ErrorMetricsSnapshot;
  business: { eventsTotal: number; eventsByName: Record<string, number> };
  workers: WorkerStatus[];
  system: { uptimeSeconds: number; memoryResidentBytes: number; cpuUserSeconds: number };
}

/** Segments that look like identifiers rather than route names. */
const ID_SEGMENT = /^(?:[0-9]+|c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-fA-F]{16,}|G[A-Z2-7]{55})$/;

/**
 * Replace identifier-looking path segments with `:id` so metric labels never
 * carry certificate IDs, wallet addresses or user IDs.
 */
export function normalizeRouteLabel(route: string): string {
  const [pathOnly = ''] = route.split('?');
  return (
    pathOnly
      .split('/')
      .map((segment) => (segment && ID_SEGMENT.test(segment) ? ':id' : segment))
      .join('/') || '/'
  );
}

/** Bucket a status code into a low-cardinality class label. */
function statusClass(statusCode: string): string {
  const first = statusCode.charAt(0);
  return /[1-5]/.test(first) ? `${first}xx` : 'unknown';
}

function parseHitRatio(hitRate: string): number {
  const value = Number.parseFloat(hitRate.replace('%', ''));
  return Number.isFinite(value) ? Number((value / 100).toFixed(4)) : 0;
}

function aggregateRoutes(requestsByRoute: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(requestsByRoute)) {
    const spaceIdx = key.indexOf(' ');
    const method = spaceIdx === -1 ? '' : key.slice(0, spaceIdx);
    const route = spaceIdx === -1 ? key : key.slice(spaceIdx + 1);
    const normalized = method ? `${method} ${normalizeRouteLabel(route)}` : normalizeRouteLabel(route);
    out[normalized] = (out[normalized] ?? 0) + count;
  }
  return out;
}

function aggregateStatusClasses(requestsByStatus: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [status, count] of Object.entries(requestsByStatus)) {
    const cls = statusClass(status);
    out[cls] = (out[cls] ?? 0) + count;
  }
  return out;
}

/**
 * Build the stable snapshot. Safe to call on every scrape — it only reads
 * already-aggregated in-process counters.
 */
export function buildMetricsSnapshot(
  summary: MetricsSummary = metricsCollector.getSummary()
): MetricsSnapshot {
  const cacheMetrics = cacheService.getMetrics();
  const backendUp: 0 | 1 = redisClient.isHealthy() ? 1 : 0;

  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    collectedAt: summary.collectedAt,
    cache: {
      backendUp,
      backendMode: redisClient.getMode(),
      hitsTotal: cacheMetrics.hits,
      missesTotal: cacheMetrics.misses,
      hitRatio: parseHitRatio(cacheMetrics.hitRate),
    },
    http: {
      requestsTotal: summary.performance.totalRequests,
      averageDurationMilliseconds: summary.performance.averageDurationMs,
      requestsByRoute: aggregateRoutes(summary.performance.requestsByRoute),
      requestsByStatusClass: aggregateStatusClasses(summary.performance.requestsByStatus),
    },
    errors: {
      errorsTotal: summary.errors.totalErrors,
      errorsByType: summary.errors.errorsByType,
    },
    business: {
      eventsTotal: summary.business.totalEvents,
      eventsByName: summary.business.eventsByName,
    },
    workers: workerRegistry.list(),
    system: {
      uptimeSeconds: summary.system.uptimeSeconds,
      memoryResidentBytes: Math.round(summary.system.memoryUsageMB * 1024 * 1024),
      cpuUserSeconds: Number((summary.system.cpuUserMs / 1000).toFixed(3)),
    },
  };
}

// ─── Prometheus text exposition ───────────────────────────────────────────────

/** Escape a label value per the Prometheus exposition format. */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

/** Keep label values bounded and free of anything payload-like. */
function safeLabelValue(value: string): string {
  return escapeLabelValue(value.slice(0, 120));
}

function renderLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${safeLabelValue(v)}"`).join(',')}}`;
}

interface MetricFamily {
  name: string;
  help: string;
  type: 'counter' | 'gauge';
  samples: Array<{ labels?: Record<string, string>; value: number }>;
}

function renderFamily(family: MetricFamily): string {
  const lines = [
    `# HELP ${family.name} ${family.help}`,
    `# TYPE ${family.name} ${family.type}`,
  ];
  for (const sample of family.samples) {
    lines.push(`${family.name}${renderLabels(sample.labels ?? {})} ${sample.value}`);
  }
  return lines.join('\n');
}

/**
 * Render a snapshot as Prometheus text exposition (content type
 * `text/plain; version=0.0.4`). Names, units and help strings are stable.
 */
export function renderPrometheus(snapshot: MetricsSnapshot = buildMetricsSnapshot()): string {
  const families: MetricFamily[] = [
    {
      name: `${PREFIX}_cache_backend_up`,
      help: 'Cache backend reachability: 1 = reachable, 0 = unreachable.',
      type: 'gauge',
      samples: [{ labels: { mode: snapshot.cache.backendMode }, value: snapshot.cache.backendUp }],
    },
    {
      name: `${PREFIX}_cache_hits_total`,
      help: 'Total cache lookups served from cache since process start.',
      type: 'counter',
      samples: [{ value: snapshot.cache.hitsTotal }],
    },
    {
      name: `${PREFIX}_cache_misses_total`,
      help: 'Total cache lookups that missed since process start.',
      type: 'counter',
      samples: [{ value: snapshot.cache.missesTotal }],
    },
    {
      name: `${PREFIX}_cache_hit_ratio`,
      help: 'Cache hit ratio over the process lifetime, 0-1.',
      type: 'gauge',
      samples: [{ value: snapshot.cache.hitRatio }],
    },
    {
      name: `${PREFIX}_http_requests_total`,
      help: 'HTTP requests handled, by method and normalised route.',
      type: 'counter',
      samples: Object.entries(snapshot.http.requestsByRoute).map(([key, value]) => {
        const spaceIdx = key.indexOf(' ');
        const method = spaceIdx === -1 ? 'UNKNOWN' : key.slice(0, spaceIdx);
        const route = spaceIdx === -1 ? key : key.slice(spaceIdx + 1);
        return { labels: { method, route }, value };
      }),
    },
    {
      name: `${PREFIX}_http_responses_total`,
      help: 'HTTP responses handled, by status class (2xx/4xx/5xx).',
      type: 'counter',
      samples: Object.entries(snapshot.http.requestsByStatusClass).map(([cls, value]) => ({
        labels: { status_class: cls },
        value,
      })),
    },
    {
      name: `${PREFIX}_http_request_duration_milliseconds_avg`,
      help: 'Mean HTTP request duration in milliseconds over retained samples.',
      type: 'gauge',
      samples: [{ value: snapshot.http.averageDurationMilliseconds }],
    },
    {
      name: `${PREFIX}_errors_total`,
      help: 'Application errors recorded, by error type. Messages are not exported.',
      type: 'counter',
      samples: [
        { labels: { type: 'all' }, value: snapshot.errors.errorsTotal },
        ...Object.entries(snapshot.errors.errorsByType).map(([type, value]) => ({
          labels: { type },
          value,
        })),
      ],
    },
    {
      name: `${PREFIX}_business_events_total`,
      help: 'Domain events recorded, by event name.',
      type: 'counter',
      samples: Object.entries(snapshot.business.eventsByName).map(([event, value]) => ({
        labels: { event },
        value,
      })),
    },
    {
      name: `${PREFIX}_worker_up`,
      help: 'Background worker state: 1 = running, 0 = stopped or degraded.',
      type: 'gauge',
      samples: snapshot.workers.map((w) => ({
        labels: { worker: w.name, state: w.state },
        value: w.state === 'running' ? 1 : 0,
      })),
    },
    {
      name: `${PREFIX}_worker_jobs_completed_total`,
      help: 'Background jobs completed successfully, by worker.',
      type: 'counter',
      samples: snapshot.workers.map((w) => ({ labels: { worker: w.name }, value: w.jobsCompleted })),
    },
    {
      name: `${PREFIX}_worker_jobs_failed_total`,
      help: 'Background jobs that failed, by worker.',
      type: 'counter',
      samples: snapshot.workers.map((w) => ({ labels: { worker: w.name }, value: w.jobsFailed })),
    },
    {
      name: `${PREFIX}_process_uptime_seconds`,
      help: 'Process uptime in seconds.',
      type: 'gauge',
      samples: [{ value: snapshot.system.uptimeSeconds }],
    },
    {
      name: `${PREFIX}_process_resident_memory_bytes`,
      help: 'Resident heap usage of the Node.js process in bytes.',
      type: 'gauge',
      samples: [{ value: snapshot.system.memoryResidentBytes }],
    },
    {
      name: `${PREFIX}_process_cpu_user_seconds_total`,
      help: 'User CPU time consumed by the process in seconds.',
      type: 'counter',
      samples: [{ value: snapshot.system.cpuUserSeconds }],
    },
  ];

  return `${families.map(renderFamily).join('\n')}\n`;
}

/** Content type expected by Prometheus-compatible scrapers. */
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
