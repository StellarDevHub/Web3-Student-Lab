import { NextFunction, Request, Response } from 'express';
import { getRateLimitProfile } from '../config/rateLimit.config.js';
import redis from '../utils/redis.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/**
 * API key tier configuration.
 * Higher-tier keys receive larger burst and sustained quotas.
 * Loaded from RATE_LIMIT_API_KEY_TIERS_JSON env var at startup.
 *
 * Example value:
 *   [
 *     { "prefix": "pk_premium_", "burstMax": 100, "sustainedMax": 2000 },
 *     { "prefix": "pk_standard_", "burstMax": 30,  "sustainedMax": 600  }
 *   ]
 */
interface ApiKeyTierConfig {
  prefix: string;
  burstMax: number;
  sustainedMax: number;
}

// ---------------------------------------------------------------------------
// API key tier registry
// ---------------------------------------------------------------------------

const API_KEY_TIERS: ApiKeyTierConfig[] = (() => {
  try {
    const raw = process.env.RATE_LIMIT_API_KEY_TIERS_JSON;
    if (raw) return JSON.parse(raw) as ApiKeyTierConfig[];
  } catch {
    logger.warn('[rateLimiter] Could not parse RATE_LIMIT_API_KEY_TIERS_JSON — using defaults');
  }
  return [];
})();

/**
 * Resolve API key tier overrides.
 * Returns the matching tier's multipliers or null for no override.
 */
function resolveApiKeyTier(apiKey: string | undefined): ApiKeyTierConfig | null {
  if (!apiKey) return null;
  return API_KEY_TIERS.find((tier) => apiKey.startsWith(tier.prefix)) ?? null;
}

// ---------------------------------------------------------------------------
// Trusted-proxy IP extraction (spoofing-resistant)
// ---------------------------------------------------------------------------

/**
 * Number of trusted reverse proxy hops in front of this service.
 * Set TRUSTED_PROXY_DEPTH=1 for a single load balancer, 2 for two layers, etc.
 * Defaults to 0 (no trusted proxy — use socket remote address directly).
 */
const TRUSTED_PROXY_DEPTH = parseInt(process.env.TRUSTED_PROXY_DEPTH || '0', 10);

/**
 * Parse the X-Forwarded-For header safely, returning only the hop that is
 * exactly `depth` positions from the right (i.e. the last untrusted IP before
 * the first trusted proxy hop).
 *
 * Example: depth=1, X-Forwarded-For: "1.2.3.4, 10.0.0.1, 10.0.0.2"
 *   → Right-to-left: [10.0.0.2 (proxy), 10.0.0.1 (proxy), 1.2.3.4 (client)]
 *   → Returns "1.2.3.4"
 *
 * If depth=0 or the header is absent we fall back to the socket address, which
 * cannot be spoofed by the client.
 */
function extractClientIp(req: Request): string {
  const socketAddr = req.socket?.remoteAddress || 'unknown';

  if (TRUSTED_PROXY_DEPTH <= 0) {
    return socketAddr;
  }

  const xffHeader = req.headers['x-forwarded-for'];
  if (!xffHeader) return socketAddr;

  const xff = Array.isArray(xffHeader) ? xffHeader.join(',') : xffHeader;
  const parts = xff
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // Walk back from the right by TRUSTED_PROXY_DEPTH hops
  const clientIndex = parts.length - TRUSTED_PROXY_DEPTH - 1;
  if (clientIndex < 0) {
    // Fewer IPs in the header than expected trusted hops — suspicious; use socket addr
    logger.warn(`[rateLimiter] X-Forwarded-For hop count (${parts.length}) < TRUSTED_PROXY_DEPTH (${TRUSTED_PROXY_DEPTH}); using socket address`);
    return socketAddr;
  }

  return parts[clientIndex];
}

// ---------------------------------------------------------------------------
// Redis sliding-window core
// ---------------------------------------------------------------------------

function tierKey(prefix: string, identifier: string, windowMs: number): string {
  return `rl:${prefix}:${identifier}:${windowMs}`;
}

async function checkTier(
  key: string,
  windowMs: number,
  max: number,
  now: number
): Promise<TierResult> {
  const client = redis;
  if (!client) {
    throw new Error('Redis unavailable');
  }

  const windowStart = now - windowMs;
  const multi = client.multi();
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

// ---------------------------------------------------------------------------
// Identifier extraction (spoofing-resistant)
// ---------------------------------------------------------------------------

function getIdentifier(req: Request): { userKey: string; ipKey: string; apiKey: string | undefined } {
  const ip = extractClientIp(req);
  const userId = (req as any).user?.id;
  // API keys may arrive via Authorization: ApiKey <key> or X-API-Key header
  const authHeader = req.headers['authorization'] || '';
  const apiKey =
    (req.headers['x-api-key'] as string | undefined) ||
    (authHeader.toLowerCase().startsWith('apikey ') ? authHeader.slice(7) : undefined);

  return {
    userKey: userId || ip,
    ipKey: ip,
    apiKey,
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

/**
 * Distributed Redis token-bucket rate limiter.
 *
 * Advanced features (Issue #1384):
 *   - Spoofing-resistant IP extraction using TRUSTED_PROXY_DEPTH
 *   - API key tier quotas: keys matching configured prefixes receive higher limits
 *   - Tiered burst + sustained windows enforced via Redis sorted sets
 *   - Standard RateLimit-* headers (RFC 6585 draft-7) on every response
 *   - Fails open on Redis errors (logs warn, never blocks legitimate traffic)
 *
 * Closes #1384
 */
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

  // Apply API key tier multiplier if present
  const apiKeyTier = resolveApiKeyTier(identifier.apiKey);
  const effectiveBurstMax = apiKeyTier ? apiKeyTier.burstMax : profile.burst.max;
  const effectiveSustainedMax = apiKeyTier ? apiKeyTier.sustainedMax : profile.sustained.max;

  // Prefer user ID for API key holders so their quota is tied to their account
  // rather than the originating IP (which may be a shared egress IP).
  const rateLimitKey = identifier.apiKey
    ? `apikey:${identifier.apiKey.slice(0, 24)}` // truncate for Redis key safety
    : profile.isAuthenticated
    ? identifier.userKey
    : identifier.ipKey;

  const rateLimitPrefix = profile.isAuthenticated || identifier.apiKey ? 'user' : 'ip';

  try {
    const burstKey = tierKey(rateLimitPrefix, rateLimitKey, profile.burst.windowMs);
    const sustainedKey = tierKey(rateLimitPrefix, rateLimitKey, profile.sustained.windowMs);

    const [burst, sustained] = await Promise.all([
      checkTier(burstKey, profile.burst.windowMs, effectiveBurstMax, now),
      checkTier(sustainedKey, profile.sustained.windowMs, effectiveSustainedMax, now),
    ]);

    if (!enforceTier(burst, sustained, rateLimitKey, rateLimitPrefix, method, path, res)) {
      return;
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
      const client = redis;
      if (!client) {
        throw new Error('Redis unavailable');
      }
      const multi = client.multi();
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
