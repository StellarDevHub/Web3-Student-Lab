/**
 * Content Security Policy Configuration
 * 
 * This file defines the production CSP directives with audited allowlists.
 * All third-party origins are documented and approved for the Web3 Student Lab.
 * 
 * APPROVED THIRD-PARTY ORIGINS:
 * 
 * 1. Stellar Network Endpoints:
 *    - https://soroban-testnet.stellar.org (Soroban RPC)
 *    - https://soroban-test.stellar.org:443 (Alternative Soroban RPC)
 *    - https://horizon-testnet.stellar.org (Horizon API)
 *    - https://stellar.expert (Block explorer)
 * 
 * 2. Wallet Extensions (communicate via window objects, no CSP needed):
 *    - Freighter (extension)
 *    - Albedo (web-based, popup)
 *    - Rabet (extension)
 * 
 * 3. Monaco Editor:
 *    - Loaded from local bundle (no external CDN)
 * 
 * 4. WebSocket Connections:
 *    - Backend WebSocket (configurable via NEXT_PUBLIC_WS_URL)
 *    - Yjs collaboration server (configurable via NEXT_PUBLIC_WS_URL)
 * 
 * 5. Backend API:
 *    - Configured via NEXT_PUBLIC_API_URL
 */

export interface CSPConfig {
  directives: Record<string, string[]>;
  reportOnly?: boolean;
  reportUri?: string;
}

/**
 * Get environment-specific URLs
 */
function getEnvUrls() {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL 
    ? new URL(process.env.NEXT_PUBLIC_API_URL).origin 
    : 'http://localhost:8080';
  
  const wsOrigin = process.env.NEXT_PUBLIC_WS_URL
    ? new URL(process.env.NEXT_PUBLIC_WS_URL.replace(/^ws/, 'http')).origin
    : 'http://localhost:8080';

  const frontendOrigin = process.env.NEXT_PUBLIC_FRONTEND_URL
    ? new URL(process.env.NEXT_PUBLIC_FRONTEND_URL).origin
    : 'http://localhost:3000';

  return { apiOrigin, wsOrigin, frontendOrigin };
}

/**
 * Production CSP Configuration
 * 
 * This is the restrictive CSP for production use.
 * Uses nonce-based script loading and specific origin allowlists.
 */
export function getProductionCSP(): CSPConfig {
  const { apiOrigin, wsOrigin, frontendOrigin } = getEnvUrls();
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    directives: {
      // Default to same-origin only
      'default-src': ["'self'"],
      
      // Scripts: self, nonce for inline scripts, no eval in production
      'script-src': [
        "'self'",
        "'nonce-{nonce}'",
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ],
      
      // Styles: self, nonce for inline styles, unsafe-inline for styled-components
      'style-src': [
        "'self'",
        "'nonce-{nonce}'",
        "'unsafe-inline'", // Required for styled-components and Tailwind
      ],
      
      // Images: self, data URLs, https for Stellar avatars/images
      'img-src': [
        "'self'",
        'data:',
        'blob:',
        'https:',
        // Add specific image origins if needed
        'https://stellar.expert',
      ],
      
      // Fonts: self and data URLs
      'font-src': [
        "'self'",
        'data:',
      ],
      
      // Connect: API, WebSocket, Stellar endpoints
      'connect-src': [
        "'self'",
        apiOrigin,
        wsOrigin.replace(/^http/, 'ws'),
        wsOrigin.replace(/^http/, 'wss'),
        // Stellar endpoints
        'https://soroban-testnet.stellar.org',
        'https://soroban-test.stellar.org:443',
        'https://horizon-testnet.stellar.org',
        'https://stellar.expert',
        // Allow all HTTPS in development for flexibility
        ...(isDevelopment ? ['https:'] : []),
      ],
      
      // Frames: Only allow specific iframes (none currently needed)
      'frame-src': [
        "'self'",
        // Add specific frame origins if needed (e.g., for embedded content)
      ],
      
      // Objects: Block all plugins
      'object-src': ["'none'"],
      
      // Base URI: Restrict to same origin
      'base-uri': ["'self'"],
      
      // Form actions: Restrict to same origin
      'form-action': ["'self'"],
      
      // Frame ancestors: Prevent clickjacking
      'frame-ancestors': ["'none'"],
      
      // Block mixed content
      'block-all-mixed-content': [],
      
      // Upgrade insecure requests
      'upgrade-insecure-requests': [],
      
      // Worker sources: For web workers
      'worker-src': ["'self'", 'blob:'],
      
      // Manifest: Allow self
      'manifest-src': ["'self'"],
    },
    reportOnly: false,
    reportUri: process.env.NEXT_PUBLIC_CSP_REPORT_URI,
  };
}

/**
 * Report-Only CSP Configuration
 * 
 * Use this for testing CSP violations without blocking requests.
 * Enable via NEXT_PUBLIC_CSP_REPORT_ONLY=true
 */
export function getReportOnlyCSP(): CSPConfig {
  const config = getProductionCSP();
  config.reportOnly = true;
  return config;
}

/**
 * Development CSP Configuration
 * 
 * More permissive CSP for development with hot reload and debugging tools.
 */
export function getDevelopmentCSP(): CSPConfig {
  const { apiOrigin, wsOrigin } = getEnvUrls();

  return {
    directives: {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-eval'",
        "'unsafe-inline'",
      ],
      'style-src': [
        "'self'",
        "'unsafe-inline'",
      ],
      'img-src': [
        "'self'",
        'data:',
        'blob:',
        'https:',
        'http:', // Allow HTTP in development
      ],
      'font-src': ["'self'", 'data:'],
      'connect-src': [
        "'self'",
        apiOrigin,
        wsOrigin.replace(/^http/, 'ws'),
        wsOrigin.replace(/^http/, 'wss'),
        'https:',
        'http:', // Allow HTTP in development
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

/**
 * Get the appropriate CSP configuration based on environment
 */
export function getCSPConfig(): CSPConfig {
  const isReportOnly = process.env.NEXT_PUBLIC_CSP_REPORT_ONLY === 'true';
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isReportOnly) {
    return getReportOnlyCSP();
  }

  if (isDevelopment) {
    return getDevelopmentCSP();
  }

  return getProductionCSP();
}

/**
 * Convert CSP directives to header value string
 */
export function cspDirectivesToString(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive;
      }
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Get the complete CSP header value
 */
export function getCSPHeaderValue(): string {
  const config = getCSPConfig();
  const cspString = cspDirectivesToString(config.directives);
  
  if (config.reportOnly) {
    return `Content-Security-Policy-Report-Only: ${cspString}${config.reportUri ? `; report-uri ${config.reportUri}` : ''}`;
  }
  
  return `Content-Security-Policy: ${cspString}${config.reportUri ? `; report-uri ${config.reportUri}` : ''}`;
}
