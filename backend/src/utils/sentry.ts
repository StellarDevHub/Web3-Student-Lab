import type { ErrorRequestHandler, RequestHandler, Application } from 'express';
import * as Sentry from '@sentry/node';
import { isTracingEnabled } from '../instrumentation.js';
import { redactSensitiveData } from './logSanitizer.js';

let sentryEnabled = false;

const SENTRY_SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'walletprivatekey',
  'privatekey',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'x-api-key',
  'credential',
  'secretkey',
  'passwd',
  'pwd',
]);

const ROUTINE_ERROR_NAMES = new Set([
  'ZodError',
  'ValidationError',
  'BadRequestError',
  'NotFoundError',
]);

const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

function scrubSentryValue(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    const withoutBearer = input.replace(BEARER_TOKEN_REGEX, 'Bearer [REDACTED]');
    return redactSensitiveData(withoutBearer);
  }

  if (Array.isArray(input)) {
    return input.map((item) => scrubSentryValue(item));
  }

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENTRY_SENSITIVE_KEYS.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = scrubSentryValue(value);
      }
    }
    return out;
  }

  return input;
}

/**
 * Scrub an outgoing Sentry payload so secrets/PII never leave the process
 * (#1425 / BE-076). A JSON round-trip normalises Sentry's class instances into
 * plain data before recursive key and pattern redaction inspects it.
 */
export function scrubSentryPayload<T>(payload: T): T {
  try {
    return scrubSentryValue(JSON.parse(JSON.stringify(payload))) as T;
  } catch {
    return payload;
  }
}

function extractHttpStatus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d{3}$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

/**
 * Filter high-volume routine client errors (4xx, 404s, validation failures)
 * from Sentry alert quotas while preserving critical 5xx exceptions.
 */
export function shouldDropRoutineError(
  event: Sentry.ErrorEvent,
  hint?: Sentry.EventHint,
): boolean {
  const original = hint?.originalException;
  if (original && typeof original === 'object') {
    const errObj = original as { status?: unknown; statusCode?: unknown; name?: unknown };
    const status = extractHttpStatus(errObj.statusCode) ?? extractHttpStatus(errObj.status);
    if (status !== undefined && status >= 400 && status < 500) {
      return true;
    }
    if (typeof errObj.name === 'string' && ROUTINE_ERROR_NAMES.has(errObj.name)) {
      return true;
    }
  }

  const responseStatus = extractHttpStatus(
    (event.contexts?.response as Record<string, unknown> | undefined)?.status_code,
  );
  if (responseStatus !== undefined && responseStatus >= 400 && responseStatus < 500) {
    return true;
  }

  const tagStatus = extractHttpStatus(event.tags?.status_code);
  if (tagStatus !== undefined && tagStatus >= 400 && tagStatus < 500) {
    return true;
  }

  return false;
}

export function getTracesSampleRate(env: string | undefined = process.env.NODE_ENV): number {
  return env === 'production' ? 0.1 : 1.0;
}

export function sentryBeforeSend(
  event: Sentry.ErrorEvent,
  hint?: Sentry.EventHint,
): Sentry.ErrorEvent | null {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  if (shouldDropRoutineError(event, hint)) {
    return null;
  }

  const scrubbed = scrubSentryPayload(event);
  const environment = scrubbed.environment || process.env.NODE_ENV || 'development';
  scrubbed.environment = environment;
  scrubbed.tags = {
    ...scrubbed.tags,
    environment,
  };

  return scrubbed;
}

export function sentryBeforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  return scrubSentryPayload(breadcrumb);
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
    tracesSampleRate: getTracesSampleRate(),
    attachStacktrace: true,
    normalizeDepth: 5,
    // The OpenTelemetry SDK (src/instrumentation.ts) owns the global tracer
    // provider and exports to Jaeger; Sentry keeps error tracking.
    skipOpenTelemetrySetup: isTracingEnabled(),
    beforeSend: sentryBeforeSend,
    beforeBreadcrumb: sentryBeforeBreadcrumb,
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
