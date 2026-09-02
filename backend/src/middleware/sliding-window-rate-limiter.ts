/**
 * Sliding-Window Rate Limiting (#1133).
 *
 * Redis-based sliding window rate limiter for all public endpoints.
 * Uses a sorted set with timestamp scores for precise window tracking,
 * unlike fixed-window limiters that allow bursts at window boundaries.
 *
 * Usage:
 *   import { slidingWindowLimiter } from '../middleware/sliding-window-rate-limiter';
 *
 *   app.use('/api/', slidingWindowLimiter({ maxRequests: 100, windowMs: 60_000 }));
 */

import { Request, Response, NextFunction } from 'express';
import { redisConnection } from '../utils/redis';

export interface SlidingWindowConfig {
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Redis key prefix. */
  prefix?: string;
  /** Function to extract the rate limit key from request. */
  keyGenerator?: (req: Request) => string;
  /** Custom message when rate limited. */
  message?: string;
  /** Skip rate limiting for certain requests. */
  skip?: (req: Request) => boolean;
}

const DEFAULT_KEY_PREFIX = 'rl:sliding:';
const DEFAULT_MESSAGE = 'Too many requests. Please try again later.';

/**
 * Create a sliding window rate limiter middleware.
 */
export function slidingWindowLimiter(config: SlidingWindowConfig) {
  const {
    maxRequests,
    windowMs,
    prefix = DEFAULT_KEY_PREFIX,
    message = DEFAULT_MESSAGE,
    skip,
  } = config;

  const keyGenerator = config.keyGenerator ?? ((req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  });

  // Lua script for atomic sliding window check
  const SLIDING_WINDOW_SCRIPT = `
    local key = KEYS[1]
    local window = tonumber(ARGV[1])
    local maxRequests = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    -- Remove entries outside the window
    redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

    -- Count current entries
    local current = redis.call('ZCARD', key)

    if current < maxRequests then
      -- Add this request
      redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
      redis.call('PEXPIRE', key, window)
      return {current + 1, 0}
    else
      -- Rate limited — get oldest entry for Retry-After
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local retryAfter = 0
      if #oldest >= 2 then
        retryAfter = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
      end
      return {current, retryAfter}
    end
  `;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip && skip(req)) {
      return next();
    }

    const key = `${prefix}${keyGenerator(req)}`;
    const now = Date.now();

    try {
      const result = await redisConnection.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        String(windowMs),
        String(maxRequests),
        String(now),
      ) as [number, number];

      const [currentCount, retryAfter] = result;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

      if (currentCount >= maxRequests) {
        res.setHeader('Retry-After', String(retryAfter || Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: message });
      }

      next();
    } catch {
      // Redis failure — fail open (allow request)
      next();
    }
  };
}

/**
 * Pre-configured rate limiters for common endpoint classes.
 */
export const apiLimiter = slidingWindowLimiter({
  maxRequests: 100,
  windowMs: 60_000,
  prefix: 'rl:api:',
});

export const authLimiter = slidingWindowLimiter({
  maxRequests: 10,
  windowMs: 60_000,
  prefix: 'rl:auth:',
  keyGenerator: (req) => req.ip || 'unknown',
});

export const publicLimiter = slidingWindowLimiter({
  maxRequests: 30,
  windowMs: 60_000,
  prefix: 'rl:public:',
});
