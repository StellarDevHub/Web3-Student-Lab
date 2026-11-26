/**
 * Inbound HTTP latency histogram for the Prometheus exporter (BE-077).
 *
 * Uses the matched Express route pattern (`req.route.path`, e.g.
 * `/api/v1/certificates/:id`) as the label, never the raw URL, so identifiers
 * cannot leak into metrics and label cardinality stays bounded. Unmatched
 * requests collapse into a single `(unmatched)` series instead of emitting one
 * label per scanned path.
 */

import type { Request, Response, NextFunction } from 'express';
import { httpRequestDurationSeconds } from '../metrics/prometheusMetrics.js';

function statusClass(statusCode: number): string {
  const first = Math.floor(statusCode / 100);
  return first >= 1 && first <= 5 ? `${first}xx` : 'unknown';
}

function resolveRouteLabel(req: Request): string {
  const route = (req as Request & { route?: { path?: unknown } }).route;
  if (route && typeof route.path === 'string' && route.path.length > 0) {
    const base = req.baseUrl || '';
    return `${base}${route.path}` || '/';
  }
  return '(unmatched)';
}

/** Express middleware recording one histogram observation per finished request. */
export function prometheusHttpMetrics() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    res.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequestDurationSeconds.observe(
        {
          method: req.method,
          route: resolveRouteLabel(req),
          status_class: statusClass(res.statusCode),
        },
        durationSeconds
      );
    });

    next();
  };
}

export default prometheusHttpMetrics;
