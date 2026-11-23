import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const NONCE_HEADER = 'x-nonce';
const ADMIN_ROUTE_PREFIX = '/admin';
const LOGIN_ROUTE = '/login';

// Security settings
const ALLOWED_ADMIN_IPS = (process.env.ALLOWED_ADMIN_IPS || '').split(',').filter(Boolean);
const ALLOWED_ADMIN_COUNTRIES = (process.env.ALLOWED_ADMIN_COUNTRIES || '').split(',').filter(Boolean);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev';

// Rate Limiting (In-memory simple rate limit for edge, resets per worker)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const MAX_REQUESTS = 100;
const WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  if (
    process.env.CI ||
    process.env.NODE_ENV === 'test' ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost'
  ) {
    return true;
  }
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_REQUESTS) {
    return false;
  }
  record.count += 1;
  return true;
}

// Bot Detection
const BOT_USER_AGENTS = ['bot', 'crawler', 'spider', 'headless', 'scraper'];
function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

// Web Crypto JWT Validation
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return atob(base64);
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

async function verifyJWT(token: string, secret: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(base64UrlDecode(headerB64));
    const payload = JSON.parse(base64UrlDecode(payloadB64));

    if (header.alg !== 'HS256') return null;
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = str2ab(base64UrlDecode(signatureB64));
    const data = enc.encode(`${headerB64}.${payloadB64}`);

    const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
    return isValid ? payload : null;
  } catch {
    return null;
  }
}

function isValidRedirectUrl(url: string, requestUrl: URL): boolean {
  try {
    const parsed = new URL(url, requestUrl.origin);
    return parsed.origin === requestUrl.origin;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/peer-review-new' || request.nextUrl.pathname === '/peer-review-new/') {
    const destination = request.nextUrl.clone();
    destination.pathname = '/peer-review';
    return NextResponse.redirect(destination, 301);
  }

  const ip = request.ip || request.headers.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || '';

  // 1. Bot detection
  if (isBot(userAgent)) {
    return new NextResponse('Bot detected', { status: 403 });
  }

  // 2. Rate limiting
  if (!checkRateLimit(ip)) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  // 3. Admin routes protection
  if (request.nextUrl.pathname.startsWith(ADMIN_ROUTE_PREFIX)) {
    const country = request.geo?.country;

    // Geo-fencing
    if (ALLOWED_ADMIN_COUNTRIES.length > 0 && country && !ALLOWED_ADMIN_COUNTRIES.includes(country)) {
      return new NextResponse('Access denied from your region', { status: 403 });
    }

    // IP Allowlisting
    if (ALLOWED_ADMIN_IPS.length > 0 && !ALLOWED_ADMIN_IPS.includes(ip) && ip !== '127.0.0.1' && ip !== '::1') {
      return new NextResponse('IP not allowed', { status: 403 });
    }

    // JWT and Session Validation
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : request.cookies.get('admin_token')?.value;

    let unauthorized = true;

    if (token) {
      const payload = await verifyJWT(token, JWT_SECRET);
      if (payload && payload.role === 'admin') {
        const sessionNonce = request.cookies.get('session_nonce')?.value;
        // Validate session nonce if present in token
        if (!payload.nonce || payload.nonce === sessionNonce) {
          unauthorized = false;
        }
      }
    }

    if (unauthorized) {
      const loginUrl = new URL(LOGIN_ROUTE, request.url);
      const returnPath = request.nextUrl.pathname + request.nextUrl.search;

      if (isValidRedirectUrl(returnPath, request.nextUrl)) {
        loginUrl.searchParams.set('returnTo', returnPath);
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  // 4. Open Redirect protection on Login
  if (request.nextUrl.pathname === LOGIN_ROUTE) {
    const returnTo = request.nextUrl.searchParams.get('returnTo');
    if (returnTo && !isValidRedirectUrl(returnTo, request.nextUrl)) {
      request.nextUrl.searchParams.delete('returnTo');
      return NextResponse.redirect(request.nextUrl);
    }
  }

  // 5. Strict CSP with a fresh cryptographic nonce for every request.
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  let nonceBinary = '';
  nonceBytes.forEach((byte) => {
    nonceBinary += String.fromCharCode(byte);
  });
  const nonce = btoa(nonceBinary);
  const isDev = process.env.NODE_ENV === 'development';
  const hostname = request.nextUrl.hostname;
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';

  const directives: Record<string, string[]> = isDev
    ? {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-eval'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': [
          "'self'",
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
          process.env.NEXT_PUBLIC_WS_URL?.replace(/^wss?/, 'ws') || 'ws://localhost:8080',
          process.env.NEXT_PUBLIC_WS_URL?.replace(/^wss?/, 'wss') || 'wss://localhost:8080',
          'https://soroban-testnet.stellar.org',
          'https://soroban-test.stellar.org:443',
          'https://horizon-testnet.stellar.org',
          'https://stellar.expert',
          'ws:', 'wss:', 'https:', 'http:',
        ],
        'frame-src': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
      }
    : {
        'default-src': ["'self'"],
        'script-src': [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': [
          "'self'",
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
          (process.env.NEXT_PUBLIC_WS_URL || 'wss://localhost:8080').replace(/^https/, 'wss').replace(/^http/, 'ws'),
          (process.env.NEXT_PUBLIC_WS_URL || 'wss://localhost:8080').replace(/^wss?/, 'wss'),
          'https://soroban-testnet.stellar.org',
          'https://soroban-test.stellar.org:443',
          'https://horizon-testnet.stellar.org',
          'https://stellar.expert',
        ],
        'frame-src': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'block-all-mixed-content': [],
        'upgrade-insecure-requests': [],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
      };

  if (!isDev && isLocalhost) {
    delete directives['block-all-mixed-content'];
    delete directives['upgrade-insecure-requests'];
  }
  const cspValue = Object.entries(directives)
    .map(([directive, values]) => values.length ? `${directive} ${values.join(' ')}` : directive)
    .join('; ');
  const reportUri = process.env.NEXT_PUBLIC_CSP_REPORT_URI || '/api/security/csp-report';
  const cspWithReports = `${cspValue}; report-uri ${reportUri}`;
  const reportOnly = !isDev && process.env.NEXT_PUBLIC_CSP_REPORT_ONLY === 'true';

  // Next.js reads the request CSP to apply this nonce to its generated scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('Content-Security-Policy', cspWithReports);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(NONCE_HEADER, nonce);
  response.headers.set(
    reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    cspWithReports,
  );

  // HSTS — FE-HARD-49: enforce HTTPS in production
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  // Additional hardening headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
