import type { ErrorRequestHandler, RequestHandler, Application } from 'express';
import * as Sentry from '@sentry/node';
import { redactSensitiveData } from './logSanitizer.js';

let sentryEnabled = false;

/**
 * Scrub an outgoing Sentry payload so secrets/PII never leave the process
 * (#1425). A JSON round-trip normalises Sentry's class instances into plain
 * data before the shared sanitizer inspects it.
 */
function scrubSentryPayload<T>(payload: T): T {
  try {
    return redactSensitiveData(JSON.parse(JSON.stringify(payload))) as T;
  } catch {
    return payload;
  }
}

export function initializeSentry(app?: Application): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] SENTRY_DSN not set. Centralized error tracking disabled for local environment.');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || 'web3-student-lab-backend@1.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    attachStacktrace: true,
    normalizeDepth: 5,
    beforeSend(event) {
      if (process.env.NODE_ENV === 'test') {
        return null;
      }
      return scrubSentryPayload(event);
    },
  });

  sentryEnabled = true;

  // Handle unhandled promise rejections & uncaught exceptions
  process.on('unhandledRejection', (reason) => {
    console.error('[Sentry] Unhandled Rejection:', reason);
    if (sentryEnabled) {
      Sentry.captureException(reason);
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('[Sentry] Uncaught Exception:', error);
    if (sentryEnabled) {
      Sentry.captureException(error);
    }
  });

  if (app && typeof (Sentry as any).setupExpressErrorHandler === 'function') {
    (Sentry as any).setupExpressErrorHandler(app);
  }

  console.log('[Sentry] Telemetry & Distributed Tracing initialized successfully.');
}

export function captureException(error: unknown): void {
  if (!sentryEnabled) {
    return;
  }
  Sentry.captureException(error);
}

/**
 * Stream a (sanitized) security telemetry message to Sentry. Used by the
 * threat-detection middleware (#1425).
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'warning',
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled) {
    return;
  }
  Sentry.captureMessage(redactSensitiveData(message) as string, {
    level,
    ...(context ? { extra: redactSensitiveData(context) as Record<string, unknown> } : {}),
  });
}

export function getSentryRequestHandler(): RequestHandler {
  if (!sentryEnabled) {
    return (_req, _res, next) => next();
  }
  return typeof (Sentry as any).Handlers?.requestHandler === 'function'
    ? (Sentry as any).Handlers.requestHandler()
    : (_req, _res, next) => next();
}

export function getSentryErrorHandler(): ErrorRequestHandler {
  if (!sentryEnabled) {
    return (err, _req, _res, next) => next(err);
  }
  return typeof (Sentry as any).Handlers?.errorHandler === 'function'
    ? (Sentry as any).Handlers.errorHandler()
    : (err, _req, _res, next) => next(err);
}
