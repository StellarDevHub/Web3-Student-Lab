import { createHash } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import {
  isMutatingHttpMethod,
  markUserWriteToPrimary,
  pinCurrentSessionToPrimary,
  runWithDbRoutingContext,
} from '../db/requestContext.js';

interface RequestWithUser extends Request {
  user?: {
    id?: string;
  };
}

const getFirstHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  return value?.trim() || undefined;
};

const extractSessionCookie = (cookieHeader: string | undefined): string | undefined => {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValueParts] = part.trim().split('=');
    const key = rawKey?.trim().toLowerCase();
    if (key === 'session_id' || key === 'sessionid' || key === 'sid') {
      const value = rawValueParts.join('=').trim();
      if (value) {
        return value;
      }
    }
  }

  return undefined;
};

/**
 * Derives a stable session identifier from headers, cookies, or auth token so
 * read-after-write session pinning works consistently across requests (BE-061).
 */
export const extractDbRoutingSessionId = (req: Request): string | undefined => {
  const headerSessionId = getFirstHeaderValue(req.headers['x-session-id']);
  if (headerSessionId) {
    return `session:${headerSessionId}`;
  }

  const cookieSessionId = extractSessionCookie(getFirstHeaderValue(req.headers.cookie));
  if (cookieSessionId) {
    return `session:${cookieSessionId}`;
  }

  const authHeader = getFirstHeaderValue(req.headers.authorization);
  if (authHeader) {
    const tokenHash = createHash('sha256').update(authHeader).digest('hex').slice(0, 32);
    return `auth:${tokenHash}`;
  }

  return undefined;
};

export const extractPreferredRegion = (req: Request): string | undefined => {
  const region =
    getFirstHeaderValue(req.headers['x-db-region']) ??
    getFirstHeaderValue(req.headers['x-region']);
  return region ? region.toLowerCase() : undefined;
};

/**
 * Express middleware (BE-061):
 * - Routes GET read queries to multi-region read replicas.
 * - Routes mutating queries (POST, PUT, PATCH, DELETE) to the primary database.
 * - Pins the mutating user/session to the primary database for 3 seconds
 *   after a write operation to guarantee read-after-write consistency.
 */
export function dbRoutingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const reqWithUser = req as RequestWithUser;
  const userId = reqWithUser.user?.id;
  const sessionId = extractDbRoutingSessionId(req);
  const region = extractPreferredRegion(req);

  runWithDbRoutingContext(
    req.method,
    () => {
      if (isMutatingHttpMethod(req.method)) {
        // Pin immediately for concurrent requests in flight
        pinCurrentSessionToPrimary();

        // Also pin on response finish so userId populated by downstream auth
        // middleware is pinned for the full 3-second replication-lag window.
        res.on('finish', () => {
          if (res.statusCode < 500) {
            pinCurrentSessionToPrimary();
            if (reqWithUser.user?.id) {
              markUserWriteToPrimary(reqWithUser.user.id);
            }
          }
        });
      }

      next();
    },
    { userId, sessionId, region }
  );
}
