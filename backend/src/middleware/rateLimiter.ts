import { NextFunction, Request, Response } from 'express';
import { getRateLimitProfile } from '../config/rateLimit.config.js';
import redis from '../utils/redis.js';
import logger from '../utils/logger.js';

interface TierResult {
  limit: number;
  remaining: number;
  resetMs: number;
  windowMs: number;
}

// Legacy interface for the slidingWindowRateLimiter factory
interface RateLimitOptions {
  windowMs: number;
  limit: number;
  keyPrefix: string;
}

function tierKey(prefix: string, identifier: string, windowMs: number): string {
  return `rl:${prefix}:${identifier}:${windowMs}`;
}

async function checkTier(
  key: string,
  windowMs: number,
  max: number,
  now: number
): Promise<TierResult> {
  const windowStart = now - windowMs;
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zadd(key, now, now.toString());
  multi.zcard(key);
  multi.expire(key, Math.ceil(windowMs / 1000) + 1);
  const results = await multi.exec();

  if (!results) {
    throw new Error('Redis transaction failed');
  }

  const requestCount = (results[2]?.[1] as number) ?? 0;
  const remaining = Math.max(0, max - requestCount);

  return {
    limit: max,
    remaining,
    resetMs: now + windowMs,
    windowMs,
  };
}

function getIdentifier(req: Request): { userKey: string; ipKey: string } {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userId = (req as any).user?.id;
  return {
    userKey: userId || ip,
    ipKey: ip,
  };
}

function enforceTier(
  burst: TierResult,
  sustained: TierResult,
  identifier: string,
  identifierType: string,
  method: string,
  path: string,
  res: Response
): boolean {
  const allowed = burst.remaining > 0 && sustained.remaining > 0;
  const retryAfterMs = Math.max(
    allowed ? 0 : burst.resetMs - Date.now(),
    allowed ? 0 : sustained.resetMs - Date.now()
  );

  const limit = Math.min(burst.limit, sustained.limit);
  const remaining = Math.min(burst.remaining, sustained.remaining);

  res.setHeader('RateLimit-Limit', limit);
  res.setHeader('RateLimit-Remaining', remaining);
  res.setHeader('RateLimit-Reset', new Date(Math.min(burst.resetMs, sustained.resetMs)).toISOString());
  res.setHeader('X-RateLimit-Burst-Limit', burst.limit);
  res.setHeader('X-RateLimit-Burst-Remaining', burst.remaining);
  res.setHeader('X-RateLimit-Sustained-Limit', sustained.limit);
  res.setHeader('X-RateLimit-Sustained-Remaining', sustained.remaining);

  if (!allowed) {
    logger.warn(`Rate limit exceeded for ${identifierType} ${identifier} on ${method} ${path}`, {
      burst: burst.remaining,
      sustained: sustained.remaining,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please slow down.',
      retry_after: Math.ceil(retryAfterMs / 1000),
    });
    return false;
  }

  return true;
}

// --- New config-driven middleware (used globally) ---

export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const now = Date.now();
  const path = req.path;
  const method = req.method;
  const user = (req as any).user;
  const profile = getRateLimitProfile(path, method, user);
  const identifier = getIdentifier(req);

  try {
    if (profile.isAuthenticated) {
      const burstKey = tierKey('user', identifier.userKey, profile.burst.windowMs);
      const sustainedKey = tierKey('user', identifier.userKey, profile.sustained.windowMs);

      const [burst, sustained] = await Promise.all([
        checkTier(burstKey, profile.burst.windowMs, profile.burst.max, now),
        checkTier(sustainedKey, profile.sustained.windowMs, profile.sustained.max, now),
      ]);

      if (!enforceTier(burst, sustained, identifier.userKey, 'user', method, path, res)) {
        return;
      }
    } else {
      const burstKey = tierKey('ip', identifier.ipKey, profile.burst.windowMs);
      const sustainedKey = tierKey('ip', identifier.ipKey, profile.sustained.windowMs);

      const [burst, sustained] = await Promise.all([
        checkTier(burstKey, profile.burst.windowMs, profile.burst.max, now),
        checkTier(sustainedKey, profile.sustained.windowMs, profile.sustained.max, now),
      ]);

      if (!enforceTier(burst, sustained, identifier.ipKey, 'IP', method, path, res)) {
        return;
      }
    }

    next();
  } catch (error) {
    logger.error('Rate limiter error, failing open:', error);
    next();
  }
}

export const apiRateLimiter = rateLimiter;

// --- Legacy factory for route-specific rate limiting ---

export function slidingWindowRateLimiter(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.id || 'unauthenticated';
    const key = `${options.keyPrefix}:${userId}:${ip}`;
    const now = Date.now();
    const windowStart = now - options.windowMs;

    try {
      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, now.toString());
      multi.zcard(key);
      multi.expire(key, Math.ceil(options.windowMs / 1000) + 1);

      const results = await multi.exec();
      if (!results) {
        throw new Error('Redis transaction failed');
      }

      const requestCount = (results[2]?.[1] as number) ?? 0;
      const remaining = Math.max(0, options.limit - requestCount);

      res.setHeader('X-RateLimit-Limit', options.limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', new Date(now + options.windowMs).toISOString());

      if (requestCount > options.limit) {
        logger.warn(`Rate limit exceeded for ${key}`);
        return res.status(429).json({
          status: 'error',
          message: 'Too many requests, please try again later.',
          retry_after: Math.ceil(options.windowMs / 1000),
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error:', error);
      next();
    }
  };
}
