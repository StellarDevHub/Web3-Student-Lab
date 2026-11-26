import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';

export const EDGE_RATE_LIMIT_MAX_REQUESTS = 100;
export const EDGE_RATE_LIMIT_WINDOW = '1 m' as const;
export const EDGE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const EDGE_RATE_LIMIT_PREFIX = 'wsl:edge:ratelimit';

const LOCAL_IPS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface EdgeRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
  bypassed: boolean;
  key: string;
}

export interface EdgeRateLimitInput {
  ip: string;
  studentId?: string | null;
}

export interface EdgeRateLimiterLike {
  limit: (identifier: string) => Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
}

let cachedLimiter: EdgeRateLimiterLike | null | undefined;

function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return atob(base64);
}

function extractStudentIdFromJwt(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    const candidate =
      payload.studentId ?? payload.student_id ?? payload.sub ?? payload.userId;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function extractClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const firstForwardedIp = forwardedFor
    ? forwardedFor.split(',')[0]?.trim()
    : undefined;
  const realIp = request.headers.get('x-real-ip')?.trim();

  return request.ip || firstForwardedIp || realIp || '127.0.0.1';
}

export function extractStudentId(request: NextRequest): string | null {
  const headerId = request.headers.get('x-student-id')?.trim();
  if (headerId) return headerId;

  const cookieId = request.cookies.get('student_id')?.value?.trim();
  if (cookieId) return cookieId;

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;
  const cookieToken =
    request.cookies.get('auth_token')?.value?.trim() ||
    request.cookies.get('token')?.value?.trim();

  const token = bearerToken || cookieToken;
  if (token) {
    return extractStudentIdFromJwt(token);
  }

  return null;
}

export function buildRateLimitKey(ip: string, studentId?: string | null): string {
  const normalizedIp = ip.trim() || 'unknown';
  const normalizedStudentId = studentId?.trim();
  if (normalizedStudentId) {
    return `ip:${normalizedIp}:student:${normalizedStudentId}`;
  }
  return `ip:${normalizedIp}`;
}

export function shouldBypassRateLimit(ip: string): boolean {
  return Boolean(
    process.env.CI ||
      process.env.NODE_ENV === 'test' ||
      LOCAL_IPS.has(ip.trim()),
  );
}

function getDistributedLimiter(): EdgeRateLimiterLike | null {
  if (cachedLimiter !== undefined) {
    return cachedLimiter;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    cachedLimiter = null;
    return cachedLimiter;
  }

  const redis = new Redis({ url, token });
  cachedLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      EDGE_RATE_LIMIT_MAX_REQUESTS,
      EDGE_RATE_LIMIT_WINDOW,
    ),
    prefix: EDGE_RATE_LIMIT_PREFIX,
  });

  return cachedLimiter;
}

export function resetEdgeRateLimiterCache(): void {
  cachedLimiter = undefined;
}

export function createRateLimitHeaders(
  result: EdgeRateLimitResult,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(Math.max(1, result.retryAfterSeconds));
  }

  return headers;
}

export async function checkEdgeRateLimit(
  input: EdgeRateLimitInput,
  options?: {
    limiter?: EdgeRateLimiterLike | null;
    skipBypassCheck?: boolean;
  },
): Promise<EdgeRateLimitResult> {
  const key = buildRateLimitKey(input.ip, input.studentId);
  const defaultReset = Date.now() + EDGE_RATE_LIMIT_WINDOW_MS;

  if (!options?.skipBypassCheck && shouldBypassRateLimit(input.ip)) {
    return {
      allowed: true,
      limit: EDGE_RATE_LIMIT_MAX_REQUESTS,
      remaining: EDGE_RATE_LIMIT_MAX_REQUESTS,
      reset: defaultReset,
      retryAfterSeconds: 0,
      bypassed: true,
      key,
    };
  }

  const limiter =
    options && 'limiter' in options ? options.limiter : getDistributedLimiter();

  if (!limiter) {
    return {
      allowed: true,
      limit: EDGE_RATE_LIMIT_MAX_REQUESTS,
      remaining: EDGE_RATE_LIMIT_MAX_REQUESTS,
      reset: defaultReset,
      retryAfterSeconds: 0,
      bypassed: true,
      key,
    };
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(key);
    const retryAfterSeconds = success
      ? 0
      : Math.max(1, Math.ceil((reset - Date.now()) / 1000));

    return {
      allowed: success,
      limit,
      remaining,
      reset,
      retryAfterSeconds,
      bypassed: false,
      key,
    };
  } catch (error) {
    console.warn(
      '[edgeRateLimit] Upstash Redis unreachable; falling back to permissive bypass.',
      error,
    );
    return {
      allowed: true,
      limit: EDGE_RATE_LIMIT_MAX_REQUESTS,
      remaining: EDGE_RATE_LIMIT_MAX_REQUESTS,
      reset: defaultReset,
      retryAfterSeconds: 0,
      bypassed: true,
      key,
    };
  }
}
