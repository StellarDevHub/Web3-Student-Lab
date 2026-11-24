/**
 * Tracing Middleware — Issue BE-013
 *
 * Opens an OpenTelemetry SERVER span for every inbound HTTP request, continuing
 * any W3C `traceparent` / `tracestate` sent by the caller, and runs the rest of
 * the Express pipeline inside that span's context. Anything started while the
 * request is in flight — Prisma queries, RPC calls, BullMQ enqueues, Redis
 * publishes — becomes a child of this span.
 *
 * The trace id is returned to the client in the `traceresponse` header and
 * exposed as `res.locals.traceId` for log correlation.
 *
 * The middleware measures its own cost and reports it through the
 * `w3sl_tracing_overhead_seconds` histogram (budget: < 1.5ms per request).
 */

import { NextFunction, Request, RequestHandler, Response } from 'express';
import { context, isSpanContextValid, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { tracer } from '../instrumentation.js';
import { normalizeRouteLabel } from '../metrics/MetricsExporter.js';
import { httpServerDuration, tracingOverhead } from '../metrics/prometheusExporter.js';

export interface TracingMiddlewareOptions {
  /** Exact paths that are not traced (health probes, scrapes). */
  ignorePaths?: string[];
}

const DEFAULT_IGNORED_PATHS = ['/health', '/health/live', '/health/ready'];

function elapsedSeconds(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e9;
}

function statusClass(statusCode: number): string {
  return `${Math.floor(statusCode / 100)}xx`;
}

export function tracingMiddleware(options: TracingMiddlewareOptions = {}): RequestHandler {
  const ignored = new Set(options.ignorePaths ?? DEFAULT_IGNORED_PATHS);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (ignored.has(req.path)) {
      next();
      return;
    }

    const requestStart = process.hrtime.bigint();

    const parent = propagation.extract(ROOT_CONTEXT, req.headers);
    const span = tracer.startSpan(
      req.method,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': req.method,
          'url.path': req.path,
          'url.scheme': req.protocol,
          'user_agent.original': req.get('user-agent') ?? '',
        },
      },
      parent,
    );

    const spanContext = span.spanContext();
    if (isSpanContextValid(spanContext)) {
      const flags = spanContext.traceFlags.toString(16).padStart(2, '0');
      res.setHeader('traceresponse', `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`);
      res.locals.traceId = spanContext.traceId;
    }

    let overhead = elapsedSeconds(requestStart);

    res.once('finish', () => {
      const finishStart = process.hrtime.bigint();

      const rawRoute = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : `${req.baseUrl}${req.path}`;
      const route = normalizeRouteLabel(rawRoute);

      span.updateName(`${req.method} ${route}`);
      span.setAttribute('http.route', route);
      span.setAttribute('http.response.status_code', res.statusCode);
      if (res.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();

      httpServerDuration.observe(
        { method: req.method, route, status_class: statusClass(res.statusCode) },
        elapsedSeconds(requestStart),
      );

      overhead += elapsedSeconds(finishStart);
      tracingOverhead.observe({}, overhead);
    });

    context.with(trace.setSpan(parent, span), next);
  };
}

export default tracingMiddleware;
