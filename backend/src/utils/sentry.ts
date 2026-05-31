import type { ErrorRequestHandler, RequestHandler } from 'express';
import * as Sentry from '@sentry/node';

let sentryEnabled = false;

export function initializeSentry(): void {
  // Sentry DSN is optional for local and test environments.
  // Set SENTRY_DSN in production or staging to enable centralized error reporting.
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || 'web3-student-lab@1.0.0',
    tracesSampleRate: 0.05,
    attachStacktrace: true,
    normalizeDepth: 5,
    beforeSend(event) {
      if (process.env.NODE_ENV === 'test') {
        return null;
      }
      return event;
    },
  });

  sentryEnabled = true;
}

export function captureException(error: unknown): void {
  if (!sentryEnabled) {
    return;
  }
  Sentry.captureException(error);
}

export function getSentryRequestHandler(): RequestHandler {
  if (!sentryEnabled) {
    return (_req, _res, next) => next();
  }
  return Sentry.Handlers.requestHandler();
}

export function getSentryErrorHandler(): ErrorRequestHandler {
  if (!sentryEnabled) {
    return (err, _req, _res, next) => next(err);
  }
  return Sentry.Handlers.errorHandler();
}
