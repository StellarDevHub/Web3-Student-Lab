/**
 * Authorization for operational metrics endpoints.
 *
 * Monitoring agents authenticate with a shared secret, supplied either as
 * `X-Metrics-Token: <token>` or `Authorization: Bearer <token>`, compared in
 * constant time against `METRICS_AUTH_TOKEN`.
 *
 * If the variable is unset the endpoints stay open in development and test
 * (so the local dashboards and the test suite keep working) but are refused in
 * production — metrics are never silently unprotected in a deployed
 * environment.
 */

import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import logger from '../utils/logger.js';
import { ApiError, sendErrorEnvelope } from '../utils/apiError.js';

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function extractToken(req: Request): string | undefined {
  const headerToken = req.headers['x-metrics-token'];
  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken;
  }

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }

  return undefined;
}

/** Warn once per process rather than on every scrape. */
let warnedAboutMissingToken = false;

export const requireMetricsAuth = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.METRICS_AUTH_TOKEN;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return sendErrorEnvelope(
        req,
        res,
        new ApiError(503, 'Metrics endpoint is not configured', {
          code: 'SERVICE_UNAVAILABLE',
          expose: true,
        })
      );
    }

    if (!warnedAboutMissingToken) {
      warnedAboutMissingToken = true;
      logger.warn('METRICS_AUTH_TOKEN is not set — metrics endpoints are unauthenticated');
    }
    return next();
  }

  const provided = extractToken(req);
  if (!provided || !constantTimeEquals(provided, expected)) {
    return sendErrorEnvelope(req, res, ApiError.unauthorized('Invalid or missing metrics token'));
  }

  return next();
};

export default requireMetricsAuth;
