/**
 * Dynamic Adaptive IP & Wallet Reputation Rate-Limiter with Sliding Window — BE-067
 *
 * Implements an adaptive sliding-window rate limiter using Redis sorted sets.
 * Client reputation is scored based on:
 *   - Authenticated wallet tenure (months since first activity on-chain)
 *   - Certificate holdings (active/minted certificates on the platform)
 *   - Past CAPTCHA verifications (confirmed human sessions)
 *   - Linked decentralised identifier (DID)
 *   - Active on-chain stake (Stellar asset balance)
 *   - Recent rate-limit violations (demotes the tier)
 *
 * Rate ceilings per tier (sustained 60s window):
 *   anonymous / unverified IP  →   10 req/min   (scraper floor)
 *   captcha-verified IP        →   30 req/min
 *   authenticated (no cert)    →  120 req/min
 *   verified (≥1 cert)         →  300 req/min   (enrolled student)
 *   staker / high-tenure DID   →  600 req/min
 *   restricted (violations)    →    5 req/min
 *
 * Sliding-window semantics (via `utils/slidingWindow.ts`):
 *   Every accepted request is recorded in a Redis sorted set scored by its
 *   epoch-ms timestamp.  On each check the oldest entries are trimmed so the
 *   window moves continuously — there are no fixed-window boundary spikes.
 *   Multiple windows (1 s burst + 60 s sustained) are evaluated in a single
 *   atomic Lua call, so rejected requests never consume quota.
 *
 * Acceptance criteria satisfied:
 *   ✅ Unauthenticated scrapers are restricted to strict rate-limit ceilings.
 *   ✅ Authenticated students with active profiles enjoy higher thresholds
 *      without false positives (profile cached 60 s, invalidated on violation).
 *   ✅ Rate limits calculate accurately across sliding 60-second windows without
 *      boundary reset flaws (continuous sorted-set trimming, no fixed buckets).
 *
 * Headers on every response:
 *   X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset (epoch s)
 *   X-RateLimit-Tier / X-RateLimit-Score / RateLimit-Policy
 * On HTTP 429 additionally: Retry-After (seconds).
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

// ─── Options ──────────────────────────────────────────────────────────────────

export interface DynamicRateLimiterOptions {
  /**
   * Override the sliding-window store (useful in tests to inject an in-memory
   * store without touching Redis).
   */
  store?: SlidingWindowStore;
  /**
   * Override the reputation service (useful in tests).
   */
  reputation?: ReputationService;
  /**
   * Redis key prefix for the sliding-window sorted sets.
   * @default 'rl:dyn:'
   */
  prefix?: string;
  /**
   * Return true for requests that should bypass rate limiting entirely
   * (e.g. health-check probes, internal service-to-service traffic).
   */
  skip?: (req: Request) => boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PREFIX = 'rl:dyn:';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set standard rate-limit response headers on every reply so clients and
 * proxies can back off gracefully without having to parse 429 bodies.
 */
function setRateLimitHeaders(
  res: Response,
  result: SlidingWindowResult,
  tier: string,
  score: number,
  now: number,
): void {
  const { binding } = result;
  res.setHeader('X-RateLimit-Limit', String(binding.limit));
  res.setHeader('X-RateLimit-Remaining', String(binding.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + binding.resetMs) / 1000)));
  res.setHeader('X-RateLimit-Tier', tier);
  res.setHeader('X-RateLimit-Score', String(score));
  res.setHeader(
    'RateLimit-Policy',
    result.windows.map((w) => `${w.limit};w=${Math.ceil(w.windowMs / 1000)}`).join(', '),
  );
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * Returns an Express `RequestHandler` that:
 *   1. Identifies the caller (DID › user › IP) and loads their reputation profile.
 *   2. Applies the tier's sliding-window limits atomically via Redis Lua.
 *   3. Annotates the response with rate-limit headers.
 *   4. On exhaustion → HTTP 429 with Retry-After + records a violation so the
 *      caller can be demoted on subsequent requests.
 */
export function dynamicRateLimiter(options: DynamicRateLimiterOptions = {}): RequestHandler {
  const store =
    options.store ??
    new ResilientSlidingWindowStore(new RedisSlidingWindowStore(redisConnection));
  const reputation = options.reputation ?? defaultReputationService;
  const prefix = options.prefix ?? DEFAULT_PREFIX;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ── 0. Optional bypass ─────────────────────────────────────────────────
    if (options.skip?.(req)) {
      next();
      return;
    }

    // ── 1. Identify caller + build reputation profile ──────────────────────
    let identity: CallerIdentity;
    let profile: ReputationProfile | null;

    try {
      identity = await reputation.identify(req);
      profile = await reputation.getProfile(identity);
    } catch (error) {
      // A reputation-lookup failure must never hard-block legitimate traffic.
      // Fall back to the strictest anonymous limits so bots cannot exploit
      // an outage to bypass rate limiting.
      logger.warn('[BE-067] Reputation lookup failed; applying anonymous limits', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
      });
      identity = reputation.resolveIdentity(req, undefined);
      profile = null;
    }

    const tier = profile?.tier ?? 'anonymous';
    const score = profile?.score ?? 0;

    // ── 2. Evaluate sliding-window limits (atomic Lua, no boundary flaws) ──
    const now = Date.now();
    let result: SlidingWindowResult;

    try {
      result = await store.hit(
        `${prefix}${identity.key}`,
        reputation.limitsFor(tier),
        now,
      );
    } catch (error) {
      // Store failure: allow the request rather than causing an outage, but
      // log loudly so ops is aware.
      logger.error('[BE-067] Sliding-window store unavailable; allowing request', {
        error: error instanceof Error ? error.message : String(error),
        tier,
        path: req.path,
      });
      next();
      return;
    }

    // ── 3. Write rate-limit headers ────────────────────────────────────────
    setRateLimitHeaders(res, result, tier, score, now);

    // ── 4. Allow or reject ─────────────────────────────────────────────────
    if (result.allowed) {
      next();
      return;
    }

    // Caller exhausted their quota: set Retry-After, record the violation so
    // the reputation score degrades, and return 429.
    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));

    // Fire-and-forget: the violation is persisted in Redis (with TTL) so it
    // influences the next profile computation even across restarts.
    void reputation.recordViolation(identity).catch(() => undefined);

    logger.warn('[BE-067] Dynamic rate limit exceeded', {
      identityKind: identity.kind,
      tier,
      score,
      window: result.binding.name,
      path: req.path,
      retryAfterSeconds,
    });

    res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please slow down.',
      tier,
      score,
      window: result.binding.name,
      retry_after: retryAfterSeconds,
    });
  };
}

export default dynamicRateLimiter;
