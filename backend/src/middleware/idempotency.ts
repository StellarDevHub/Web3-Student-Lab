/**
 * idempotency.ts — Issue #985
 *
 * Express middleware that provides idempotency guarantees for POST/PATCH
 * endpoints by storing the first response in Redis (TTL: 24 h) and replaying
 * it for any duplicate request carrying the same Idempotency-Key header.
 *
 * Behaviour:
 *  • If no Idempotency-Key header is present the request is forwarded as-is.
 *  • First time a key is seen: the response is captured, serialised, and stored
 *    in Redis.  The key is locked for the duration of the in-flight request so
 *    concurrent duplicates receive a 409 rather than triggering two executions.
 *  • Subsequent requests with the same key within the TTL window receive the
 *    cached response with an X-Idempotency-Replay: true header.
 *  • After the TTL a new operation is allowed (key expired).
 *
 * Usage:
 *   import { idempotency } from '../middleware/idempotency.js';
 *   router.post('/certificates', idempotency(), async (req, res) => { ... });
 *
 *   // Custom TTL (seconds):
 *   router.post('/payments', idempotency({ ttlSeconds: 3600 }), handler);
 *
 * API consumer documentation:
 *   Clients MUST send a globally unique `Idempotency-Key` header (UUID v4
 *   recommended) on every POST or PATCH request they want to be idempotent.
 *
 *   Example:
 *     POST /api/v1/certificates
 *     Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
 *
 *   Responses:
 *     202 / 201 / 200 — first execution, result stored.
 *     2xx with X-Idempotency-Replay: true — duplicate, cached result returned.
 *     409 — a concurrent request with the same key is still in flight.
 *     400 — Idempotency-Key value is malformed (longer than 256 chars).
 */

import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger.js';
import redisClient from '../utils/redis.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface IdempotencyOptions {
  /** Redis TTL in seconds.  Defaults to 86 400 (24 hours). */
  ttlSeconds?: number;
  /**
   * Optional function that extracts a scope prefix from the request (e.g. the
   * authenticated user's id) to prevent key collisions across users.
   */
  scopeFn?: (req: Request) => string | undefined;
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

const LOCK_TTL_SECONDS = 30; // max in-flight time before lock expires

function cacheKey(scope: string, idempotencyKey: string): string {
  return `idempotency:result:${scope}:${idempotencyKey}`;
}

function lockKey(scope: string, idempotencyKey: string): string {
  return `idempotency:lock:${scope}:${idempotencyKey}`;
}

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Returns an Express middleware that enforces idempotency for the route it is
 * applied to.
 */
export function idempotency(opts: IdempotencyOptions = {}) {
  const ttl = opts.ttlSeconds ?? 86_400; // 24 hours

  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const rawKey = req.headers['idempotency-key'] as string | undefined;

    // No key supplied — skip idempotency check and continue normally.
    if (!rawKey) {
      next();
      return;
    }

    // Basic validation.
    if (rawKey.length > 256) {
      res.status(400).json({
        error: 'Idempotency-Key must not exceed 256 characters.',
      });
      return;
    }

    // Build a scoped cache key so different users can reuse the same key value
    // without colliding.
    const scope = opts.scopeFn?.(req) ?? 'global';
    const resultKey = cacheKey(scope, rawKey);
    const inflightKey = lockKey(scope, rawKey);

    try {
      // ── Check for a previously completed response ────────────────────────
      const cached = await redisClient.get(resultKey);
      if (cached) {
        let parsed: CachedResponse;
        try {
          parsed = JSON.parse(cached) as CachedResponse;
        } catch {
          // Corrupt cache entry — remove it and proceed as a fresh request.
          await redisClient.del(resultKey);
          next();
          return;
        }

        logger.info('Idempotency cache hit — replaying stored response', {
          idempotencyKey: rawKey,
          scope,
          statusCode: parsed.statusCode,
        });

        // Restore headers
        for (const [header, value] of Object.entries(parsed.headers)) {
          res.setHeader(header, value);
        }
        res.setHeader('X-Idempotency-Replay', 'true');
        res.status(parsed.statusCode).send(parsed.body);
        return;
      }

      // ── Acquire an in-flight lock (SET NX EX) ────────────────────────────
      // Using SET with NX (only set if not exists) and EX (expire after N s)
      // is atomic and works correctly across multiple backend instances sharing
      // the same Redis.
      const acquired = await (redisClient as any).set(
        inflightKey,
        '1',
        'EX',
        LOCK_TTL_SECONDS,
        'NX'
      );

      if (!acquired) {
        // Another request with the same key is currently being processed.
        res.status(409).json({
          error:
            'A request with this Idempotency-Key is already in progress. ' +
            'Retry after the original request completes.',
        });
        return;
      }

      // ── Intercept the response so we can cache it ─────────────────────────
      let responseBody = '';
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const captureAndStore = async (body: unknown): Promise<void> => {
        responseBody = typeof body === 'string' ? body : JSON.stringify(body);

        // Only cache successful (2xx) responses.
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const headers: Record<string, string> = {};
          const contentType = res.getHeader('content-type');
          if (contentType) headers['content-type'] = String(contentType);

          const payload: CachedResponse = {
            statusCode: res.statusCode,
            headers,
            body: responseBody,
          };

          try {
            await redisClient.setex(resultKey, ttl, JSON.stringify(payload));
            logger.info('Idempotency response cached', {
              idempotencyKey: rawKey,
              scope,
              statusCode: res.statusCode,
              ttl,
            });
          } catch (redisErr) {
            logger.warn('Failed to cache idempotency response', {
              idempotencyKey: rawKey,
              error: redisErr,
            });
          }
        }

        // Release the lock regardless of success/failure.
        try {
          await redisClient.del(inflightKey);
        } catch (lockErr) {
          logger.warn('Failed to release idempotency lock', {
            idempotencyKey: rawKey,
            error: lockErr,
          });
        }
      };

      // Wrap res.json
      res.json = function (body: unknown) {
        captureAndStore(body).catch((err) =>
          logger.error('Idempotency capture error', { error: err })
        );
        return originalJson(body);
      };

      // Wrap res.send for non-JSON responses
      res.send = function (body: unknown) {
        captureAndStore(body).catch((err) =>
          logger.error('Idempotency capture error', { error: err })
        );
        return originalSend(body);
      };

      next();
    } catch (err) {
      logger.error('Idempotency middleware error', { error: err, idempotencyKey: rawKey });
      // On unexpected Redis errors, fail open — let the request proceed without
      // idempotency protection rather than taking the API offline.
      next();
    }
  };
}
