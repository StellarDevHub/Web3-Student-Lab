/**
 * requestLogger.ts — Issue #981
 *
 * Middleware that:
 *   1. Generates or extracts a unique traceId (UUID v4) for every request.
 *   2. Wraps the request lifecycle inside traceContext.run() so that ALL
 *      subsequent async operations (Prisma queries, Redis calls, BullMQ jobs,
 *      WebSocket callbacks) automatically inherit the traceId.
 *   3. Attaches the traceId to every outgoing response via X-Request-ID header.
 *   4. Logs structured request/response entries — every entry carries traceId
 *      automatically via the Winston traceIdFormat.
 *
 * OpenTelemetry notes:
 *   The traceId stored in AsyncLocalStorage is intentionally formatted as a
 *   UUID v4 so it can be used as an OTel trace-id with no changes.  To wire up
 *   an OTel exporter later, configure the OTEL_EXPORTER_* env vars and import
 *   @opentelemetry/sdk-node — no code changes required here.
 */

import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import logger, {
  traceContext,
  setCorrelationId,
  getCorrelationId,
  clearCorrelationId,
} from '../utils/logger.js';
import { redactSensitiveData } from '../utils/logSanitizer.js';

// ─── Extend Express typings ──────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      startTime?: number;
      /** @deprecated use traceId */
      correlationId?: string;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveTraceId(req: Request): string {
  // Accept a trace-id forwarded by an upstream gateway or by the client for
  // end-to-end correlation.  Fall back to a fresh UUID.
  return (
    (req.headers['x-request-id'] as string | undefined) ||
    (req.headers['x-correlation-id'] as string | undefined) ||
    randomUUID()
  );
}

/**
 * Deep-sanitize request headers/body/query with the shared log sanitizer so
 * secrets and PII are masked by both key name and value pattern (#1425).
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return redactSensitiveData(headers) as Record<string, unknown>;
}

function sanitizeBody(body: unknown): unknown {
  return redactSensitiveData(body);
}

// ─── Detailed Request Logger Middleware ──────────────────────────────────────

/**
 * Detailed request logger with AsyncLocalStorage-based trace propagation.
 *
 * Every log line emitted anywhere inside the request's async call chain will
 * automatically include `traceId` — no manual passing required.
 */
export const detailedRequestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const traceId = resolveTraceId(req);
  const startTime = Date.now();

  // Attach to request object for manual access
  req.traceId = traceId;
  req.correlationId = traceId;
  req.startTime = startTime;

  // Set correlation ID in synchronous logger context for compatibility
  setCorrelationId(traceId);

  // Echo headers back to the client immediately
  res.setHeader('X-Request-ID', traceId);
  res.setHeader('X-Correlation-ID', traceId);

  traceContext.run({ traceId }, () => {
    // Log the incoming request
    logger.info('Incoming request', {
      method: req.method,
      url: req.originalUrl || req.url,
      correlationId: traceId,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      headers: sanitizeHeaders(req.headers as Record<string, unknown>),
      body: sanitizeBody(req.body),
      query: redactSensitiveData(req.query),
    });

    // Intercept res.send to log the response
    const originalSend = res.send.bind(res);
    res.send = function (data: unknown) {
      const duration = Date.now() - startTime;
      const level =
        res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      logger[level]('Request completed', {
        method: req.method,
        url: req.originalUrl || req.url,
        correlationId: traceId,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length'),
        contentType: res.get('Content-Type'),
      });

      clearCorrelationId();
      return originalSend(data);
    };

    next();
  });
};

/**
 * Legacy request logger for simple logging compatibility.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const method = req.method;
  const url = req.originalUrl || req.url;
  const correlationId = getCorrelationId();

  logger.info(`${method} ${url}`, correlationId ? { correlationId } : {});
  next();
};
