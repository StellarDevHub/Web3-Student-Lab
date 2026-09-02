import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const NONCE_HEADER = 'x-nonce';
const CSP_REPORT_HEADER = 'Content-Security-Policy-Report-Only';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const response = NextResponse.next();
  response.headers.set(NONCE_HEADER, nonce);

  const cspDirectives = {
    'default-src': ["'self'"],
    'script-src': [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'"],
    'style-src': [`'nonce-${nonce}'`, "'self'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
      process.env.NEXT_PUBLIC_WS_URL?.replace(/^ws/, 'wss') || 'wss://localhost:8080',
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

  const cspValue = Object.entries(cspDirectives)
    .map(([directive, values]) => {
      if (values.length === 0) return directive;
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');

  response.headers.set('Content-Security-Policy', cspValue);
  response.headers.set('Content-Security-Policy-Report-Only', `${cspValue}; report-uri ${process.env.NEXT_PUBLIC_CSP_REPORT_URI || '/api/security/csp-report'}`);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
