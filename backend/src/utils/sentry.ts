import type { ErrorRequestHandler, RequestHandler, Application } from 'express';
import * as Sentry from '@sentry/node';

let sentryEnabled = false;

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
      return event;
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
