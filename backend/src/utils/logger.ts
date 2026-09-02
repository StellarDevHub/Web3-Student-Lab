/**
 * logger.ts
 *
 * Structured Winston logger with AsyncLocalStorage-based trace-id propagation.
 *
 * Issue #981 — every log line carries a `traceId` field automatically because
 * AsyncLocalStorage propagates across async boundaries (Promises, timers,
 * callbacks) without any manual passing.
 *
 * Usage:
 *   import logger, { traceContext } from './logger.js';
 *
 *   // Bind a traceId to a new async scope (done once in middleware):
 *   traceContext.run({ traceId: 'abc-123' }, () => { ... });
 *
 *   // Read the current traceId anywhere downstream:
 *   const { traceId } = traceContext.getStore() ?? {};
 */

import { AsyncLocalStorage } from 'async_hooks';
import winston, { format } from 'winston';
import { redactSensitiveData } from './logSanitizer.js';

// ─── Async context store ────────────────────────────────────────────────────

export interface TraceStore {
  traceId: string;
  /** Optional parent span for OpenTelemetry-compatible nesting */
  parentSpanId?: string;
}

/**
 * Singleton AsyncLocalStorage instance shared across the entire process.
 * Any async operation (Promise, setTimeout, setImmediate, I/O callback, …)
 * that is *started* inside a `traceContext.run(…)` block inherits the store.
 */
export const traceContext = new AsyncLocalStorage<TraceStore>();

/**
 * Retrieve the traceId from the current async context.
 * Returns undefined when called outside a traced scope.
 */
export function getTraceId(): string | undefined {
  return traceContext.getStore()?.traceId;
}

// ─── Backward-compatible helpers (kept for callsites that used the old API) ─

/**
 * @deprecated Use traceContext.run() in middleware instead.
 *             Kept for backward compatibility — sets correlationId on the
 *             *current* sync stack only; will NOT propagate across await.
 */
export function setCorrelationId(_id: string): void {
  // no-op: callers should migrate to traceContext.run()
}

/** @deprecated Use getTraceId() instead. */
export function getCorrelationId(): string | undefined {
  return getTraceId();
}

/** @deprecated no-op — AsyncLocalStorage clears automatically. */
export function clearCorrelationId(): void {
  // no-op
}

// ─── Winston format that injects traceId into every log record ──────────────

const { combine, timestamp, printf, colorize, errors, json, metadata } = format;

const traceIdFormat = format((info) => {
  const id = getTraceId();
  if (id) {
    info.traceId = id;
  }
  return info;
})();

const sanitizeFormat = format((info) => {
  for (const key of Object.keys(info)) {
    if (!['level', 'message', 'timestamp', 'traceId', 'stack', 'symbol'].includes(key)) {
      info[key] = redactSensitiveData(info[key]);
    }
  }
  return info;
})();

/**
 * Human-readable console format used in development.
 */
const consoleLogFormat = printf(({ level, message, timestamp, traceId, stack, ...meta }) => {
  const prefix = traceId ? `[${traceId}] ` : '';
  const sanitizedMeta = redactSensitiveData(meta);
  const metaStr = Object.keys(sanitizedMeta).length > 0 ? ` ${JSON.stringify(sanitizedMeta)}` : '';
  return `${timestamp} ${prefix}${level}: ${stack || message}${metaStr}`;
});

/**
 * Machine-readable JSON format for production / log aggregation.
 * Includes traceId automatically via traceIdFormat.
 */
const structuredLogFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  traceIdFormat,
  sanitizeFormat,
  metadata({ fillExcept: ['message', 'level', 'timestamp', 'traceId'] }),
  json()
);

// ─── Main logger ─────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: structuredLogFormat,
  defaultMeta: {
    service: 'web3-student-lab-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        errors({ stack: true }),
        traceIdFormat,
        consoleLogFormat
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      format: structuredLogFormat,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
      format: structuredLogFormat,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        errors({ stack: true }),
        sanitizeFormat,
        consoleLogFormat
      ),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: 'logs/rejections.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        errors({ stack: true }),
        sanitizeFormat,
        consoleLogFormat
      ),
    }),
  ],
});

// ─── Audit logger (immutable, for compliance) ────────────────────────────────

/**
 * Append-only audit logger. Entries include traceId for request correlation.
 */
export const auditLogger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    traceIdFormat,
    sanitizeFormat,
    json()
  ),
  defaultMeta: {
    service: 'web3-student-lab-backend',
    logType: 'audit',
  },
  transports: [
    new winston.transports.File({
      filename: 'logs/audit-immutable.log',
      maxsize: 5242880,
      maxFiles: 10,
    }),
  ],
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a child logger with static metadata bound permanently.
 * The traceId is still inherited from the async context at log time.
 */
export function createChildLogger(meta: Record<string, unknown>): winston.Logger {
  return logger.child(meta);
}

/**
 * Log with an explicit traceId override (useful in job workers that receive
 * the traceId as job metadata rather than from the current async context).
 */
export function logWithTraceId(
  traceId: string,
  level: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const child = logger.child({ traceId });
  const logFn = (child as unknown as Record<string, (message: string, meta?: Record<string, unknown>) => void>)[level];
  if (logFn) {
    logFn(message, meta ?? {});
  }
}

/** @deprecated Use logWithTraceId */
export const logWithCorrelationId = logWithTraceId;

export default logger;
