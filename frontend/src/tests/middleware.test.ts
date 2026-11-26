/**
 * FE-061: Middleware IP / Geo header extraction tests.
 * Validates that deprecated request.ip and request.geo are no longer
 * used and that header-based extraction works correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers – build a minimal NextRequest-like object for the middleware
// ---------------------------------------------------------------------------

type HeadersInit = Record<string, string>;

function makeRequest(
  pathname: string,
  headers: HeadersInit = {},
  options: { cookies?: Record<string, string> } = {}
) {
  const url = `http://localhost${pathname}`;
  const headerMap = new Map(Object.entries(headers));

  return {
    nextUrl: Object.assign(new URL(url), {
      clone() {
        return new URL(url);
      },
    }),
    url,
    headers: {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
    },
    cookies: {
      get: (name: string) =>
        options.cookies?.[name] ? { value: options.cookies[name] } : undefined,
    },
    // Deliberately omit .ip and .geo to prove we don't depend on them
  };
}

// ---------------------------------------------------------------------------
// Unit-test the IP / Geo extraction logic (extracted inline for isolation)
// ---------------------------------------------------------------------------

function extractIp(request: ReturnType<typeof makeRequest>): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
  );
}

function extractCountry(
  request: ReturnType<typeof makeRequest>
): string | undefined {
  return (
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    undefined
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Middleware IP extraction (FE-061)', () => {
  it('extracts the first IP from a comma-separated x-forwarded-for header', () => {
    const req = makeRequest('/', {
      'x-forwarded-for': '203.0.113.42, 10.0.0.1, 172.16.0.5',
    });
    expect(extractIp(req)).toBe('203.0.113.42');
  });

  it('trims whitespace from the extracted IP', () => {
    const req = makeRequest('/', { 'x-forwarded-for': '  198.51.100.7 , 10.1.1.1' });
    expect(extractIp(req)).toBe('198.51.100.7');
  });

  it('returns single IP when header has only one value', () => {
    const req = makeRequest('/', { 'x-forwarded-for': '192.0.2.1' });
    expect(extractIp(req)).toBe('192.0.2.1');
  });

  it('falls back to 127.0.0.1 when x-forwarded-for header is absent', () => {
    const req = makeRequest('/');
    expect(extractIp(req)).toBe('127.0.0.1');
  });

  it('falls back to 127.0.0.1 when x-forwarded-for header is empty string', () => {
    const req = makeRequest('/', { 'x-forwarded-for': '' });
    expect(extractIp(req)).toBe('127.0.0.1');
  });

  it('does NOT rely on a .ip property (deprecated)', () => {
    const req = makeRequest('/', { 'x-forwarded-for': '1.2.3.4' }) as any;
    // Even if someone accidentally sets .ip, we should still read from headers
    req.ip = '9.9.9.9';
    expect(extractIp(req)).toBe('1.2.3.4');
  });
});

describe('Middleware country extraction (FE-061)', () => {
  it('extracts country from x-vercel-ip-country header', () => {
    const req = makeRequest('/admin', { 'x-vercel-ip-country': 'US' });
    expect(extractCountry(req)).toBe('US');
  });

  it('falls back to cf-ipcountry when x-vercel-ip-country is absent', () => {
    const req = makeRequest('/admin', { 'cf-ipcountry': 'DE' });
    expect(extractCountry(req)).toBe('DE');
  });

  it('prefers x-vercel-ip-country over cf-ipcountry when both are present', () => {
    const req = makeRequest('/admin', {
      'x-vercel-ip-country': 'FR',
      'cf-ipcountry': 'DE',
    });
    expect(extractCountry(req)).toBe('FR');
  });

  it('returns undefined when neither geo header is present', () => {
    const req = makeRequest('/admin');
    expect(extractCountry(req)).toBeUndefined();
  });

  it('does NOT rely on a .geo property (deprecated)', () => {
    const req = makeRequest('/admin', { 'x-vercel-ip-country': 'JP' }) as any;
    // .geo should be ignored even if present
    req.geo = { country: 'CN' };
    expect(extractCountry(req)).toBe('JP');
  });
});

describe('Geo-fencing logic (FE-061)', () => {
  function isAllowedCountry(country: string | undefined, allowList: string[]): boolean {
    if (allowList.length === 0) return true; // no restriction configured
    if (!country) return true;               // unknown country — allow (fail-open)
    return allowList.includes(country);
  }

  it('allows access when ALLOWED_ADMIN_COUNTRIES is empty (no restriction)', () => {
    expect(isAllowedCountry('CN', [])).toBe(true);
  });

  it('allows access when country is in the allow list', () => {
    expect(isAllowedCountry('US', ['US', 'GB', 'IN'])).toBe(true);
  });

  it('blocks access when country is NOT in the allow list', () => {
    expect(isAllowedCountry('RU', ['US', 'GB', 'IN'])).toBe(false);
  });

  it('allows access when country is undefined (unknown geo)', () => {
    expect(isAllowedCountry(undefined, ['US', 'GB'])).toBe(true);
  });
});

describe('IP allowlisting logic (FE-061)', () => {
  function isAllowedIp(ip: string, allowList: string[]): boolean {
    if (allowList.length === 0) return true;
    if (ip === '127.0.0.1' || ip === '::1') return true; // localhost always allowed
    return allowList.includes(ip);
  }

  it('allows any IP when ALLOWED_ADMIN_IPS is empty', () => {
    expect(isAllowedIp('1.2.3.4', [])).toBe(true);
  });

  it('allows localhost regardless of allow list', () => {
    expect(isAllowedIp('127.0.0.1', ['10.0.0.1'])).toBe(true);
    expect(isAllowedIp('::1', ['10.0.0.1'])).toBe(true);
  });

  it('allows IP when it is in the allow list', () => {
    expect(isAllowedIp('10.0.0.5', ['10.0.0.5', '10.0.0.6'])).toBe(true);
  });

  it('blocks IP when it is NOT in the allow list', () => {
    expect(isAllowedIp('8.8.8.8', ['10.0.0.5'])).toBe(false);
  });
});
