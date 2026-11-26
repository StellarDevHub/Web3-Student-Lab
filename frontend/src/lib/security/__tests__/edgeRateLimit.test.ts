import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  EDGE_RATE_LIMIT_MAX_REQUESTS,
  buildRateLimitKey,
  checkEdgeRateLimit,
  createRateLimitHeaders,
  extractClientIp,
  extractStudentId,
  resetEdgeRateLimiterCache,
  type EdgeRateLimiterLike,
} from '../edgeRateLimit';

function createMockRequest(options: {
  ip?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}): NextRequest {
  const headerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    headerMap.set(k.toLowerCase(), v);
  }
  const cookieMap = new Map<string, { value: string }>();
  for (const [k, v] of Object.entries(options.cookies ?? {})) {
    cookieMap.set(k, { value: v });
  }

  return {
    ip: options.ip,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    cookies: {
      get: (name: string) => cookieMap.get(name),
    },
  } as unknown as NextRequest;
}

function createFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.signature`;
}

describe('edgeRateLimit', () => {
  beforeEach(() => {
    resetEdgeRateLimiterCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds keys from client IP and optional student ID', () => {
    expect(buildRateLimitKey('203.0.113.10')).toBe('ip:203.0.113.10');
    expect(buildRateLimitKey('203.0.113.10', 'student-42')).toBe(
      'ip:203.0.113.10:student:student-42',
    );
    expect(buildRateLimitKey('203.0.113.10', '   ')).toBe('ip:203.0.113.10');
  });

  it('extracts client IP from request.ip, x-forwarded-for, or x-real-ip', () => {
    expect(extractClientIp(createMockRequest({ ip: '198.51.100.1' }))).toBe(
      '198.51.100.1',
    );
    expect(
      extractClientIp(
        createMockRequest({
          headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
        }),
      ),
    ).toBe('203.0.113.5');
    expect(
      extractClientIp(
        createMockRequest({
          headers: { 'x-real-ip': '203.0.113.9' },
        }),
      ),
    ).toBe('203.0.113.9');
  });

  it('extracts authenticated student ID from header, cookie, or JWT', () => {
    expect(
      extractStudentId(
        createMockRequest({ headers: { 'x-student-id': 'stu_header' } }),
      ),
    ).toBe('stu_header');

    expect(
      extractStudentId(
        createMockRequest({ cookies: { student_id: 'stu_cookie' } }),
      ),
    ).toBe('stu_cookie');

    const token = createFakeJwt({ studentId: 'stu_jwt_123' });
    expect(
      extractStudentId(
        createMockRequest({ headers: { authorization: `Bearer ${token}` } }),
      ),
    ).toBe('stu_jwt_123');
  });

  it('enforces distributed 100 req/min limit and returns Retry-After headers when exceeded', async () => {
    const sharedStore = new Map<string, number>();
    const resetAt = Date.now() + 30_000;

    const distributedLimiter: EdgeRateLimiterLike = {
      limit: async (key: string) => {
        const nextCount = (sharedStore.get(key) ?? 0) + 1;
        sharedStore.set(key, nextCount);
        const allowed = nextCount <= EDGE_RATE_LIMIT_MAX_REQUESTS;
        return {
          success: allowed,
          limit: EDGE_RATE_LIMIT_MAX_REQUESTS,
          remaining: Math.max(0, EDGE_RATE_LIMIT_MAX_REQUESTS - nextCount),
          reset: resetAt,
        };
      },
    };

    for (let i = 0; i < EDGE_RATE_LIMIT_MAX_REQUESTS; i++) {
      const res = await checkEdgeRateLimit(
        { ip: '203.0.113.20', studentId: 'stu-1' },
        { limiter: distributedLimiter, skipBypassCheck: true },
      );
      expect(res.allowed).toBe(true);
    }

    // Simulate edge cold start clearing local module state
    resetEdgeRateLimiterCache();

    // 101st request still sees the distributed counter and is rejected
    const blocked = await checkEdgeRateLimit(
      { ip: '203.0.113.20', studentId: 'stu-1' },
      { limiter: distributedLimiter, skipBypassCheck: true },
    );

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    const headers = createRateLimitHeaders(blocked);
    expect(headers['Retry-After']).toBe(String(blocked.retryAfterSeconds));
    expect(headers['X-RateLimit-Limit']).toBe(
      String(EDGE_RATE_LIMIT_MAX_REQUESTS),
    );
    expect(headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('falls back to permissive bypass when Redis is unreachable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingLimiter: EdgeRateLimiterLike = {
      limit: async () => {
        throw new Error('ECONNREFUSED: Redis unreachable');
      },
    };

    const result = await checkEdgeRateLimit(
      { ip: '203.0.113.99', studentId: 'stu-2' },
      { limiter: failingLimiter, skipBypassCheck: true },
    );

    expect(result.allowed).toBe(true);
    expect(result.bypassed).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('falls back to permissive bypass when Upstash Redis is not configured', async () => {
    const result = await checkEdgeRateLimit(
      { ip: '203.0.113.50' },
      { limiter: null, skipBypassCheck: true },
    );

    expect(result.allowed).toBe(true);
    expect(result.bypassed).toBe(true);
  });
});
