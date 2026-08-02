import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import logger, { clearCorrelationId, getCorrelationId, setCorrelationId } from '../utils/logger.js';

/**
 * Extended Request interface with correlation ID and timing information
 */
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

/**
 * Generate a unique correlation ID for distributed tracing
 * Uses UUID v4 format for uniqueness across services
 * @returns A unique correlation ID
 */
function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Extract or generate correlation ID from request
 * Priority: X-Correlation-ID header > X-Request-ID header > Generate new
 * @param req - Express request object
 * @returns Correlation ID to use for this request
 */
function getOrCreateCorrelationId(req: Request): string {
  return (
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    generateCorrelationId()
  );
}

/**
 * Sanitize request headers for logging
 * Removes sensitive information like authorization tokens
 * @param headers - Request headers
 * @returns Sanitized headers object
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'password'];

  for (const header of sensitiveHeaders) {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Sanitize request body for logging
 * Removes sensitive information like passwords
 * @param body - Request body
 * @returns Sanitized body object
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...(body as Record<string, unknown>) };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'privateKey'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Detailed Request Logger Middleware
 *
 * This middleware provides comprehensive logging for all HTTP requests including:
 * - Correlation IDs for distributed tracing
 * - Request timing metrics
 * - Request/response details (method, URL, headers, body)
 * - Response status and timing
 * - Error details
 *
 * The correlation ID is propagated through the request context and included in all log entries,
 * enabling tracking of requests across multiple services and components.
 *
 * @example
 * app.use(detailedRequestLogger);
 */
export const detailedRequestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate or extract correlation ID
  const correlationId = getOrCreateCorrelationId(req);
  req.correlationId = correlationId;

  // Set correlation ID in logger context
  setCorrelationId(correlationId);

  // Add correlation ID to response headers for client-side tracking
  res.setHeader('X-Correlation-ID', correlationId);

  // Record start time for request duration calculation
  req.startTime = Date.now();

  // Log incoming request with comprehensive details
  logger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl || req.url,
    correlationId,
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
    headers: sanitizeHeaders(req.headers),
    body: sanitizeBody(req.body),
    query: req.query,
  });

  // Capture response details
  const originalSend = res.send;
  res.send = function (data: unknown) {
    // Calculate request duration
    const duration = req.startTime ? Date.now() - req.startTime : 0;

    // Log response details
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('Request completed', {
      method: req.method,
      url: req.originalUrl || req.url,
      correlationId,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      contentType: res.get('Content-Type'),
    });

    // Clear correlation ID from context
    clearCorrelationId();

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Simple Request Logger Middleware (Legacy)
 *
 * Logs HTTP method, URL, and timestamp for each incoming request.
 * This is the original simple logger maintained for backward compatibility.
 *
 * @deprecated Use detailedRequestLogger for comprehensive logging with correlation IDs
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const method = req.method;
  const url = req.originalUrl || req.url;
  const correlationId = getCorrelationId();

  logger.info(`${method} ${url}`, correlationId ? { correlationId } : {});

  next();
};
