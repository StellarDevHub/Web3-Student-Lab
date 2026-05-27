import { NextFunction, Request, Response } from 'express';
import redis from '../utils/redis.js';
import logger from '../utils/logger.js';

interface RateLimitOptions {
  windowMs: number;
  limit: number;
  keyPrefix: string;
}

type ResolvedRateLimitConfig = RateLimitOptions;

export const slidingWindowRateLimiter = (options: RateLimitOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.id || 'unauthenticated';
    const key = `${options.keyPrefix}:${userId}:${ip}`;
    const now = Date.now();
    const windowStart = now - options.windowMs;

    try {
      // Use Redis transaction to ensure atomicity
      const multi = redis.multi();

      // Remove timestamps outside the current window
      multi.zremrangebyscore(key, 0, windowStart);

      // Add current request timestamp
      multi.zadd(key, now, now.toString());

      // Count requests in the window
      multi.zcard(key);

      // Set expiration to clean up the set
      multi.expire(key, Math.ceil(options.windowMs / 1000) + 1);

      const results = await multi.exec();

      if (!results) {
        throw new Error('Redis transaction failed');
      }

      // results[2] contains the ZCARD result
      const requestCount = (results[2] ? results[2][1] : 0) as number;
      const remaining = Math.max(0, options.limit - requestCount);

      // Set RateLimit headers
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
      // Fail open to avoid blocking users if Redis is down, or fail closed for security
      // Here we fail open but log the error
      next();
    }
  };
};

export const apiRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  return slidingWindowRateLimiter(resolveApiRateLimit(req))(req, res, next);
};

function resolveApiRateLimit(req: Request): ResolvedRateLimitConfig {
  const isAuth = !!(req as any).user;
  const baseConfig: ResolvedRateLimitConfig = {
    windowMs: 1000,
    limit: isAuth ? 80 : 20,
    keyPrefix: 'rl:api',
  };

  if (req.method !== 'GET') {
    return baseConfig;
  }

  const path = req.path;

  if (path.startsWith('/api/v1/auth/profile-status')) {
    return {
      windowMs: 1000,
      limit: 30,
      keyPrefix: 'rl:api:profile-status',
    };
  }

  if (
    path.startsWith('/api/v1/certificates') ||
    path.startsWith('/api/v1/enrollments') ||
    path.startsWith('/api/v1/courses')
  ) {
    return {
      windowMs: 1000,
      limit: isAuth ? 120 : 40,
      keyPrefix: 'rl:api:read-heavy',
    };
  }

  return baseConfig;
}
