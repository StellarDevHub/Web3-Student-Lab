/**
 * MetricsCollector — central metrics collection system for Web3 Student Lab.
 *
 * Collects three categories of metrics:
 *   - Performance: HTTP request durations, memory/CPU usage
 *   - Errors: counts by type and HTTP status code
 *   - Business: user registrations, course enrollments, certificate issuances
 *
 * Designed as a singleton so all parts of the app share one store.
 * Integrates with the existing winston logger for structured output.
 *
 * Educational note: In production you would typically export these metrics
 * to a time-series database (Prometheus, Datadog, CloudWatch) via a push or
 * pull mechanism. This implementation keeps everything in-process for
 * simplicity while exposing a clean interface that is easy to swap out.
 */

import logger from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PerformanceMetric {
  /** HTTP method (GET, POST, …) */
  method: string;
  /** Route path, e.g. /api/v1/courses */
  route: string;
  /** Response time in milliseconds */
  durationMs: number;
  /** HTTP status code */
  statusCode: number;
  /** ISO timestamp */
  timestamp: string;
}

export interface ErrorMetric {
  /** Error class name or custom label */
  type: string;
  /** Human-readable message */
  message: string;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** ISO timestamp */
  timestamp: string;
}

export interface BusinessMetric {
  /** Event name, e.g. "user.registered" */
  event: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** ISO timestamp */
  timestamp: string;
}

export interface MetricsSummary {
  performance: {
    totalRequests: number;
    averageDurationMs: number;
    /** Requests per route: { "GET /api/v1/courses": count } */
    requestsByRoute: Record<string, number>;
    /** Requests per status code: { "200": count } */
    requestsByStatus: Record<string, number>;
  };
  errors: {
    totalErrors: number;
    /** Errors per type: { "ValidationError": count } */
    errorsByType: Record<string, number>;
  };
  business: {
    totalEvents: number;
    /** Events per name: { "user.registered": count } */
    eventsByName: Record<string, number>;
  };
  system: {
    uptimeSeconds: number;
    memoryUsageMB: number;
    cpuUserMs: number;
  };
  collectedAt: string;
}

// ─── MetricsCollector ─────────────────────────────────────────────────────────

export class MetricsCollector {
  private performanceMetrics: PerformanceMetric[] = [];
  private errorMetrics: ErrorMetric[] = [];
  private businessMetrics: BusinessMetric[] = [];

  /**
   * Maximum number of raw metric entries kept in memory per category.
   * Older entries are dropped (ring-buffer style) to bound memory usage.
   */
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  // ── Performance ─────────────────────────────────────────────────────────────

  /**
   * Record a completed HTTP request.
   *
   * @param method   HTTP verb
   * @param route    Normalised route path (avoid recording raw user input to
   *                 prevent high-cardinality label explosion)
   * @param durationMs  Time from request start to response end
   * @param statusCode  HTTP response status
   */
  recordRequest(method: string, route: string, durationMs: number, statusCode: number): void {
    const metric: PerformanceMetric = {
      method,
      route,
      durationMs,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    this.performanceMetrics.push(metric);
    this.trim(this.performanceMetrics);

    // Log slow requests (>1 s) so they surface in existing log pipelines.
    if (durationMs > 1000) {
      logger.warn(`Slow request: ${method} ${route} took ${durationMs}ms (status ${statusCode})`);
    }
  }

  // ── Errors ───────────────────────────────────────────────────────────────────

  /**
   * Record an application error.
   *
   * @param type       Error class name or a short label like "UnhandledRejection"
   * @param message    Error message (avoid including PII)
   * @param statusCode HTTP status code if the error maps to one
   */
  recordError(type: string, message: string, statusCode?: number): void {
    const metric: ErrorMetric = {
      type,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    this.errorMetrics.push(metric);
    this.trim(this.errorMetrics);

    logger.error(`[Metrics] Error recorded: ${type} — ${message}`);
  }

  // ── Business ─────────────────────────────────────────────────────────────────

  /**
   * Record a business-level event.
   *
   * Examples:
   *   collector.recordEvent('user.registered', { plan: 'free' });
   *   collector.recordEvent('certificate.issued', { courseId: 'abc' });
   *
   * @param event    Dot-namespaced event name
   * @param metadata Optional key/value context (no PII)
   */
  recordEvent(event: string, metadata?: Record<string, unknown>): void {
    const metric: BusinessMetric = {
      event,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.businessMetrics.push(metric);
    this.trim(this.businessMetrics);

    logger.info(`[Metrics] Business event: ${event}`, metadata ?? {});
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  /**
   * Return an aggregated snapshot of all collected metrics.
   * This is what the /api/v1/metrics endpoint exposes.
   */
  getSummary(): MetricsSummary {
    const requestsByRoute: Record<string, number> = {};
    const requestsByStatus: Record<string, number> = {};
    let totalDuration = 0;

    for (const m of this.performanceMetrics) {
      const key = `${m.method} ${m.route}`;
      requestsByRoute[key] = (requestsByRoute[key] ?? 0) + 1;
      requestsByStatus[String(m.statusCode)] = (requestsByStatus[String(m.statusCode)] ?? 0) + 1;
      totalDuration += m.durationMs;
    }

    const totalRequests = this.performanceMetrics.length;
    const averageDurationMs = totalRequests > 0 ? totalDuration / totalRequests : 0;

    const errorsByType: Record<string, number> = {};
    for (const e of this.errorMetrics) {
      errorsByType[e.type] = (errorsByType[e.type] ?? 0) + 1;
    }

    const eventsByName: Record<string, number> = {};
    for (const b of this.businessMetrics) {
      eventsByName[b.event] = (eventsByName[b.event] ?? 0) + 1;
    }

    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      performance: {
        totalRequests,
        averageDurationMs: Math.round(averageDurationMs * 100) / 100,
        requestsByRoute,
        requestsByStatus,
      },
      errors: {
        totalErrors: this.errorMetrics.length,
        errorsByType,
      },
      business: {
        totalEvents: this.businessMetrics.length,
        eventsByName,
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        cpuUserMs: Math.round(cpuUsage.user / 1000),
      },
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * Return the raw performance metric entries (useful for debugging or export).
   */
  getPerformanceMetrics(): PerformanceMetric[] {
    return [...this.performanceMetrics];
  }

  /**
   * Return the raw error metric entries.
   */
  getErrorMetrics(): ErrorMetric[] {
    return [...this.errorMetrics];
  }

  /**
   * Return the raw business metric entries.
   */
  getBusinessMetrics(): BusinessMetric[] {
    return [...this.businessMetrics];
  }

  /**
   * Reset all collected metrics (useful in tests or after a scheduled flush).
   */
  reset(): void {
    this.performanceMetrics = [];
    this.errorMetrics = [];
    this.businessMetrics = [];
    logger.info('[Metrics] All metrics reset');
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Drop the oldest entries when the array exceeds maxEntries. */
  private trim<T>(arr: T[]): void {
    if (arr.length > this.maxEntries) {
      arr.splice(0, arr.length - this.maxEntries);
    }
  }
}

// Export a singleton instance so the whole app shares one collector.
const metricsCollector = new MetricsCollector();
export default metricsCollector;
