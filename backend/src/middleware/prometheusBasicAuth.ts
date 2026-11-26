/**
 * HTTP Basic Auth for the Prometheus scrape endpoint (BE-077).
 *
 * Credentials come from `PROMETHEUS_BASIC_AUTH_USER` /
 * `PROMETHEUS_BASIC_AUTH_PASSWORD`, which is the native scheme supported by
 * Prometheus `basic_auth` scrape configuration. Comparison is constant-time.
 *
 * If the credentials are unset the endpoint stays open in development and test
 * (so local dashboards and the test suite keep working) but returns
 * `503 SERVICE_UNAVAILABLE` in production, so a deployed instance is never
 * silently unprotected.
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import logger from '../utils/logger.js';
import { ApiError, sendErrorEnvelope } from '../utils/apiError.js';

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Parse `Authorization: Basic base64(user:password)`. */
export function parseBasicAuthHeader(
  header: string | undefined
): { user: string; password: string } | null {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice('Basic '.length).trim(), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) return null;
    return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

let warnedAboutMissingCredentials = false;

export const requirePrometheusBasicAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const expectedUser = process.env.PROMETHEUS_BASIC_AUTH_USER;
  const expectedPassword = process.env.PROMETHEUS_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
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

    if (!warnedAboutMissingCredentials) {
      warnedAboutMissingCredentials = true;
      logger.warn(
        'PROMETHEUS_BASIC_AUTH_USER/PASSWORD are not set — /metrics is unauthenticated'
      );
    }
    return next();
  }

  const provided = parseBasicAuthHeader(req.headers.authorization);
  if (!provided) {
    res.setHeader('WWW-Authenticate', 'Basic realm="metrics", charset="UTF-8"');
    return sendErrorEnvelope(req, res, ApiError.unauthorized('Basic authentication required'));
  }

  const userMatches = constantTimeEquals(provided.user, expectedUser);
  const passwordMatches = constantTimeEquals(provided.password, expectedPassword);
  if (!userMatches || !passwordMatches) {
    res.setHeader('WWW-Authenticate', 'Basic realm="metrics", charset="UTF-8"');
    return sendErrorEnvelope(req, res, ApiError.unauthorized('Invalid metrics credentials'));
  }

  return next();
};

export default requirePrometheusBasicAuth;
