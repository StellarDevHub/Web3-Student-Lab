/**
 * Dynamic Rate Limiter — Issue BE-012
 *
 * Reputation-aware sliding-window-log limiter. Each request is:
 *   1. identified (DID / student / IP) and scored by `reputationService`;
 *   2. checked against the tier's burst (1s) and sustained (60s) windows in a
 *      single atomic Redis call (`utils/slidingWindow.ts`), so there are no
 *      fixed-window boundary spikes;
 *   3. annotated with standard rate-limit headers.
 *
 * Headers on every response:
 *   X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset (epoch s)
 *   X-RateLimit-Tier, RateLimit-Policy (e.g. `10;w=1, 60;w=60`)
 * and on HTTP 429 additionally `Retry-After` (seconds).
 *
 * Rejections are reported back to the reputation service, so a caller that
 * keeps hammering is demoted to the `restricted` tier, while verified students
 * and staking DIDs are elevated automatically.
 *
 * Usage:
 *   app.use('/api', dynamicRateLimiter());
 */

import { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  reputationService as defaultReputationService,
  type CallerIdentity,
  type ReputationProfile,
  type ReputationService,
} from '../services/reputationService.js';
import logger from '../utils/logger.js';
import { redisConnection } from '../utils/redis.js';
import {
  RedisSlidingWindowStore,
  ResilientSlidingWindowStore,
  type SlidingWindowResult,
  type SlidingWindowStore,
} from '../utils/slidingWindow.js';

export interface DynamicRateLimiterOptions {
  store?: SlidingWindowStore;
  reputation?: ReputationService;
  /** Redis key prefix for the sliding-window logs. */
  prefix?: string;
  /** Skip limiting for some requests (health checks, internal traffic). */
  skip?: (req: Request) => boolean;
}

const DEFAULT_PREFIX = 'rl:dyn:';

function setRateLimitHeaders(res: Response, result: SlidingWindowResult, tier: string, now: number): void {
  const { binding } = result;
  res.setHeader('X-RateLimit-Limit', String(binding.limit));
  res.setHeader('X-RateLimit-Remaining', String(binding.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + binding.resetMs) / 1000)));
  res.setHeader('X-RateLimit-Tier', tier);
  res.setHeader(
    'RateLimit-Policy',
    result.windows.map((w) => `${w.limit};w=${Math.ceil(w.windowMs / 1000)}`).join(', '),
  );
}

export function dynamicRateLimiter(options: DynamicRateLimiterOptions = {}): RequestHandler {
  const store = options.store ?? new ResilientSlidingWindowStore(new RedisSlidingWindowStore(redisConnection));
  const reputation = options.reputation ?? defaultReputationService;
  const prefix = options.prefix ?? DEFAULT_PREFIX;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (options.skip?.(req)) {
      next();
      return;
    }

    let identity: CallerIdentity;
    let profile: ReputationProfile | null;
    try {
      identity = await reputation.identify(req);
      profile = await reputation.getProfile(identity);
    } catch (error) {
      // Reputation lookup failure must never block traffic: fall back to strict IP limits.
      logger.warn('Reputation lookup failed; applying anonymous limits', {
        error: error instanceof Error ? error.message : String(error),
      });
      identity = reputation.resolveIdentity(req, undefined);
      profile = null;
    }

    const tier = profile?.tier ?? 'anonymous';
    const now = Date.now();
    let result: SlidingWindowResult;
    try {
      result = await store.hit(`${prefix}${identity.key}`, reputation.limitsFor(tier), now);
    } catch (error) {
      logger.error('Dynamic rate limiter unavailable; allowing request', {
        error: error instanceof Error ? error.message : String(error),
      });
      next();
      return;
    }

    setRateLimitHeaders(res, result, tier, now);

    if (result.allowed) {
      next();
      return;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));

    void reputation.recordViolation(identity).catch(() => undefined);
    logger.warn('Dynamic rate limit exceeded', {
      identity: identity.kind,
      tier,
      window: result.binding.name,
      path: req.path,
    });

    res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please slow down.',
      tier,
      window: result.binding.name,
      retry_after: retryAfterSeconds,
    });
  };
}

export default dynamicRateLimiter;
