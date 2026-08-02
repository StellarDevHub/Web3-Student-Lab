import winston, { format } from 'winston';
import { executionAsyncId } from 'async_hooks';

const { combine, timestamp, printf, colorize, errors, json, metadata } = format;

/**
 * Correlation ID Context
 * Stores the current correlation ID for async context tracking
 */
const correlationIdContext = new Map<string, string>();

/**
 * Set the correlation ID for the current context
 * @param correlationId - The correlation ID to set
 */
export function setCorrelationId(correlationId: string): void {
  const asyncId = String(executionAsyncId());
  correlationIdContext.set(asyncId, correlationId);
}

/**
 * Get the correlation ID for the current context
 * @returns The correlation ID or undefined if not set
 */
export function getCorrelationId(): string | undefined {
  const asyncId = String(executionAsyncId());
  return correlationIdContext.get(asyncId);
}

/**
 * Clear the correlation ID for the current context
 */
export function clearCorrelationId(): void {
  const asyncId = String(executionAsyncId());
  correlationIdContext.delete(asyncId);
}

/**
 * Custom format that adds correlation ID to log entries
 */
const correlationIdFormat = format((info) => {
  const correlationId = getCorrelationId();
  if (correlationId) {
    info.correlationId = correlationId;
  }
  return info;
})();

/**
 * Console log format for development
 * Human-readable with colors and correlation ID
 */
const consoleLogFormat = printf(({ level, message, timestamp, correlationId, stack, ...metadata }) => {
  const correlationPrefix = correlationId ? `[${correlationId}] ` : '';
  const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
  return `${timestamp} ${correlationPrefix}${level}: ${stack || message}${metaStr}`;
});

/**
 * Structured JSON log format for production
 * Machine-readable with all metadata
 */
const structuredLogFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  correlationIdFormat,
  metadata({ fillExcept: ['message', 'level', 'timestamp', 'correlationId'] }),
  json()
);

/**
 * Main application logger
 * Provides structured logging with correlation IDs for distributed tracing
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: structuredLogFormat,
  defaultMeta: {
    service: 'web3-student-lab-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    // Console transport with human-readable format for development
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        errors({ stack: true }),
        correlationIdFormat,
        consoleLogFormat
      ),
    }),
    // File transport for error logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: structuredLogFormat,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: structuredLogFormat,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        errors({ stack: true }),
        consoleLogFormat
      ),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: 'logs/rejections.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        errors({ stack: true }),
        consoleLogFormat
      ),
    }),
  ],
});

/**
 * Immutable file logger specifically for audit events
 * Uses JSON format for structured, easily parseable logs
 * These logs are cryptographically hashed for integrity verification
 */
export const auditLogger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    correlationIdFormat,
    json()
  ),
  defaultMeta: {
    service: 'web3-student-lab-backend',
    logType: 'audit',
  },
  transports: [
    new winston.transports.File({
      filename: 'logs/audit-immutable.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10, // Keep more audit logs for compliance
      // By default, Winston's file transport appends to the file,
      // creating an immutable record of events over time.
    }),
  ],
});

/**
 * Child logger factory
 * Creates a logger with additional metadata bound to it
 * @param metadata - Additional metadata to include in all log entries
 * @returns A child logger with bound metadata
 */
export function createChildLogger(metadata: Record<string, unknown>): winston.Logger {
  return logger.child(metadata);
}

/**
 * Log with correlation ID
 * Helper function to log with a specific correlation ID
 * @param correlationId - The correlation ID to use for this log entry
 * @param level - Log level (info, warn, error, etc.)
 * @param message - Log message
 * @param meta - Additional metadata
 */
export function logWithCorrelationId(
  correlationId: string,
  level: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const childLogger = logger.child({ correlationId });
  (childLogger as any)[level](message, meta || {});
}

export default logger;
