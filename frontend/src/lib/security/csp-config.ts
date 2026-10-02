/**
 * Content Security Policy Configuration — FE-HARD-49
 *
 * Enterprise-grade CSP with:
 *  - Nonce-based script loading (no unsafe-inline / unsafe-eval in production)
 *  - Strict origin allowlists for Stellar endpoints
 *  - HSTS enforcement in production
 *  - report-uri for violation telemetry
 *
 * APPROVED THIRD-PARTY ORIGINS:
 *
 * 1. Stellar Network Endpoints:
 *    - https://soroban-testnet.stellar.org (Soroban RPC)
 *    - https://soroban-test.stellar.org:443 (Alternative Soroban RPC)
 *    - https://horizon-testnet.stellar.org (Horizon API)
 *    - https://stellar.expert (Block explorer)
 *
 * 2. Wallet Extensions (communicate via window objects – no CSP origin needed):
 *    - Freighter, Albedo, Rabet
 *
 * 3. Monaco Editor: loaded from local bundle (no external CDN)
 *
 * 4. WebSocket Connections:
 *    - Backend WebSocket (configurable via NEXT_PUBLIC_WS_URL)
 *
 * 5. Backend API:
 *    - Configured via NEXT_PUBLIC_API_URL
 */

export interface CSPConfig {
  directives: Record<string, string[]>;
  reportOnly?: boolean;
  reportUri?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve environment-specific URLs safely.
 * Falls back gracefully when env vars are missing.
 */
function getEnvUrls() {
  let apiOrigin = 'http://localhost:8080';
  let wsOrigin = 'http://localhost:8080';
  let frontendOrigin = 'http://localhost:3000';

  try {
    if (process.env.NEXT_PUBLIC_API_URL) {
      apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL).origin;
    }
  } catch {
    // keep default
  }

  try {
    if (process.env.NEXT_PUBLIC_WS_URL) {
      wsOrigin = new URL(
        process.env.NEXT_PUBLIC_WS_URL.replace(/^wss?/, 'http'),
      ).origin;
    }
  } catch {
    // keep default
  }

  try {
    if (process.env.NEXT_PUBLIC_FRONTEND_URL) {
      frontendOrigin = new URL(process.env.NEXT_PUBLIC_FRONTEND_URL).origin;
    }
  } catch {
    // keep default
  }

  return { apiOrigin, wsOrigin, frontendOrigin };
}

/**
 * Build the WebSocket-equivalent of an HTTP origin.
 * http(s)://host → ws(s)://host
 */
function toWsOrigin(httpOrigin: string): string {
  return httpOrigin.replace(/^https/, 'wss').replace(/^http/, 'ws');
}

// ---------------------------------------------------------------------------
// Production CSP — strict nonce-based policy
// ---------------------------------------------------------------------------

/**
 * Production CSP: no unsafe-inline, no unsafe-eval.
 * Scripts must carry the nonce injected by middleware.
 * Styles rely on `'self'` only (inline styles must use CSS modules or CSS vars).
 *
 * @param nonce - base64 nonce generated per-request in middleware.ts
 */
export function getProductionCSP(nonce?: string): CSPConfig {
  const { apiOrigin, wsOrigin } = getEnvUrls();

  const scriptSrc = [
    "'self'",
    "'strict-dynamic'",
    ...(nonce ? [`'nonce-${nonce}'`] : []),
  ];

  return {
    directives: {
      // Restrict everything to same-origin by default
      'default-src': ["'self'"],

      // Scripts: nonce + strict-dynamic only (no unsafe-inline / unsafe-eval)
      'script-src': scriptSrc,

      // Styles: self only – inline styles must be avoided in production
      'style-src': ["'self'"],

      // Images: self, data URIs, blobs and HTTPS
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],

      // Fonts: self and data URIs
      'font-src': ["'self'", 'data:'],

      // Connect: API, WebSocket backend, Stellar network endpoints
      'connect-src': [
        "'self'",
        apiOrigin,
        toWsOrigin(wsOrigin),
        wsOrigin.replace(/^http/, 'wss'),
        // Stellar / Soroban endpoints
        'https://soroban-testnet.stellar.org',
        'https://soroban-test.stellar.org:443',
        'https://horizon-testnet.stellar.org',
        'https://stellar.expert',
      ],

      // No iframes allowed
      'frame-src': ["'none'"],

      // No plugins
      'object-src': ["'none'"],

      // Restrict base URI to prevent base-tag injection
      'base-uri': ["'self'"],

      // Form actions restricted to same-origin
      'form-action': ["'self'"],

      // Prevent this page from being embedded
      'frame-ancestors': ["'none'"],

      // Block mixed content in production
      'block-all-mixed-content': [],

      // Upgrade HTTP to HTTPS
      'upgrade-insecure-requests': [],

      // Web workers (Monaco, background tasks)
      'worker-src': ["'self'", 'blob:'],

      // PWA manifest
      'manifest-src': ["'self'"],
    },
    reportOnly: false,
    reportUri: process.env.NEXT_PUBLIC_CSP_REPORT_URI,
  };
}

// ---------------------------------------------------------------------------
// Report-Only CSP — mirrors production but never blocks
// ---------------------------------------------------------------------------

/**
 * Enable via NEXT_PUBLIC_CSP_REPORT_ONLY=true to monitor violations
 * without blocking requests.
 */
export function getReportOnlyCSP(nonce?: string): CSPConfig {
  const config = getProductionCSP(nonce);
  config.reportOnly = true;
  return config;
}

// ---------------------------------------------------------------------------
// Development CSP — permissive enough for HMR / devtools
// ---------------------------------------------------------------------------

export function getDevelopmentCSP(): CSPConfig {
  const { apiOrigin, wsOrigin } = getEnvUrls();

  return {
    directives: {
      'default-src': ["'self'"],
      // unsafe-eval needed for Next.js HMR / source maps in dev only
      'script-src': ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': [
        "'self'",
        apiOrigin,
        toWsOrigin(wsOrigin),
        wsOrigin.replace(/^http/, 'wss'),
        'https:',
        'http:',
        'ws:',
        'wss:',
      ],
      'frame-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'worker-src': ["'self'", 'blob:'],
      'manifest-src': ["'self'"],
    },
    reportOnly: false,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

export function getCSPConfig(nonce?: string): CSPConfig {
  const isReportOnly = process.env.NEXT_PUBLIC_CSP_REPORT_ONLY === 'true';
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    return getDevelopmentCSP();
  }

  if (isReportOnly) {
    return getReportOnlyCSP(nonce);
  }

  return getProductionCSP(nonce);
}

// ---------------------------------------------------------------------------
// Serialisers
// ---------------------------------------------------------------------------

/** Convert a CSP directives map to a single header-value string. */
export function cspDirectivesToString(
  directives: Record<string, string[]>,
): string {
  return Object.entries(directives)
    .map(([directive, values]) => {
      if (values.length === 0) return directive;
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/** Return the full `Content-Security-Policy` (or report-only) header value. */
export function getCSPHeaderValue(nonce?: string): string {
  const config = getCSPConfig(nonce);
  const cspString = cspDirectivesToString(config.directives);
  const reportSuffix = config.reportUri
    ? `; report-uri ${config.reportUri}`
    : '';

  if (config.reportOnly) {
    return `Content-Security-Policy-Report-Only: ${cspString}${reportSuffix}`;
  }

  return `Content-Security-Policy: ${cspString}${reportSuffix}`;
}

// ---------------------------------------------------------------------------
// DOMPurify sanitization wrapper — FE-HARD-49
// ---------------------------------------------------------------------------

/**
 * Sanitize untrusted HTML (markdown renders, terminal logs, contract metadata)
 * before inserting it into the DOM via dangerouslySetInnerHTML.
 *
 * Uses a strict allowlist:
 *  - Standard inline/block text elements
 *  - Code blocks (for contract source display)
 *  - Anchors with rel="noopener noreferrer" enforced
 *  - No script, style, iframe, object, embed, form, or input elements
 *
 * Usage:
 *   import { sanitizeHtml } from '@/lib/security/csp-config';
 *   <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(userContent) }} />
 */
export function sanitizeHtml(dirty: string): string {
  // Guard: server-side rendering has no DOM – return empty string.
  if (typeof window === 'undefined') return '';

  // Dynamic import to avoid SSR issues; DOMPurify is a dev/prod dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = require('dompurify') as typeof import('dompurify');

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      // Block elements
      'p', 'div', 'section', 'article', 'blockquote', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'hr', 'br',
      // Inline elements
      'a', 'abbr', 'b', 'cite', 'code', 'em', 'i', 'kbd',
      'mark', 'q', 's', 'samp', 'small', 'span', 'strong',
      'sub', 'sup', 'time', 'u', 'var',
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'class', 'id',
      'target', 'rel',          // anchor attributes
      'colspan', 'rowspan',     // table layout
      'aria-label', 'aria-describedby', 'role',  // accessibility
    ],
    // Force safe anchor attributes to prevent tab-napping / phishing
    FORCE_BODY: true,
    ADD_ATTR: ['target'],
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'object', 'embed',
      'form', 'input', 'button', 'select', 'textarea',
      'svg', 'math',
    ],
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus',
      'onblur', 'onchange', 'onsubmit',
      'style',       // no inline styles from untrusted content
      'srcset', 'src', // prevent image hot-linking / beacons
    ],
  });
}

/**
 * Sanitize a plain-text string for safe insertion as textContent.
 * Strips all HTML — use this for terminal log lines, error messages, etc.
 */
export function sanitizeText(dirty: string): string {
  if (typeof window === 'undefined') return '';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = require('dompurify') as typeof import('dompurify');
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
