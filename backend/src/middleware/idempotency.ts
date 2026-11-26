import { createHash, randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger.js';
import redisClient from '../utils/redis.js';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 30;

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  fingerprint: string;
}

export interface IdempotencyOptions {
  ttlSeconds?: number;
  scopeFn?: (req: Request) => string | undefined;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requestScope(req: Request, scopeFn?: IdempotencyOptions['scopeFn']): string {
  const customScope = scopeFn?.(req);
  if (customScope) return customScope;

  const userId = req.user?.id ?? 'anonymous';
  return `${userId}:${req.method}:${req.baseUrl}${req.path}`;
}

function requestFingerprint(req: Request, scope: string, key: string): string {
  return digest(JSON.stringify({ scope, key, body: req.body ?? null }));
}

function resultKey(scope: string, key: string): string {
  return `idempotency:result:${digest(`${scope}:${key}`)}`;
}

function lockKey(scope: string, key: string): string {
  return `idempotency:lock:${digest(`${scope}:${key}`)}`;
}

async function releaseLock(key: string, owner: string): Promise<void> {
  await (redisClient as any).eval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
    1,
    key,
    owner
  );
}

export function idempotency(opts: IdempotencyOptions = {}) {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const rawHeader = req.headers['idempotency-key'];
    const rawKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    // Callers opt into protection by sending the header on the mutating route.
    if (!rawKey) {
      next();
      return;
    }

    const key = rawKey.trim();
    if (!key || key.length > 256) {
      res.status(400).json({ error: 'Idempotency-Key must be between 1 and 256 characters.' });
      return;
    }

    const scope = requestScope(req, opts.scopeFn);
    const fingerprint = requestFingerprint(req, scope, key);
    const completedKey = resultKey(scope, key);
    const inFlightKey = lockKey(scope, key);
    const owner = randomUUID();

    try {
      const cachedRaw = await redisClient.get(completedKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as CachedResponse;
        if (cached.fingerprint !== fingerprint) {
          res.status(409).json({ error: 'Idempotency-Key was already used for a different request.' });
          return;
        }

        for (const [header, value] of Object.entries(cached.headers)) {
          res.setHeader(header, value);
        }
        res.setHeader('X-Idempotency-Replay', 'true');
        res.status(cached.statusCode).send(cached.body);
        return;
      }

      const acquired = await (redisClient as any).set(
        inFlightKey,
        owner,
        'EX',
        LOCK_TTL_SECONDS,
        'NX'
      );
      if (!acquired) {
        res.status(409).json({
          error: 'A request with this Idempotency-Key is already in progress. Retry later.',
        });
        return;
      }

      let capturedBody: string | undefined;
      let finalized = false;
      const capture = (body: unknown): void => {
        if (capturedBody !== undefined) return;
        capturedBody = typeof body === 'string' ? body : JSON.stringify(body ?? null);
      };

      const finalize = async (): Promise<void> => {
        if (finalized) return;
        finalized = true;
        try {
          if (capturedBody !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
            const headers: Record<string, string> = {};
            const contentType = res.getHeader('content-type');
            if (contentType) headers['content-type'] = String(contentType);
            await redisClient.setex(
              completedKey,
              ttl,
              JSON.stringify({ statusCode: res.statusCode, headers, body: capturedBody, fingerprint })
            );
          }
        } catch (error) {
          logger.error('Failed to store idempotency response', { error });
        } finally {
          try {
            await releaseLock(inFlightKey, owner);
          } catch (error) {
            logger.error('Failed to release idempotency lock', { error });
          }
        }
      };

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      res.json = ((body: unknown) => {
        capture(body);
        return originalJson(body);
      }) as Response['json'];
      res.send = ((body: unknown) => {
        capture(body);
        return originalSend(body);
      }) as Response['send'];
      res.once('finish', () => void finalize());
      res.once('close', () => void finalize());
      next();
    } catch (error) {
      logger.error('Idempotency Redis operation failed', { error });
      // Do not execute payment/certificate business logic without protection.
      res.status(503).json({ error: 'Idempotency service unavailable. Please retry later.' });
    }
  };
}
