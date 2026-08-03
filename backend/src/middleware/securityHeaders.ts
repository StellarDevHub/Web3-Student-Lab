import { Request, Response, NextFunction } from 'express';
import config from '../config/env.config.js';

/**
 * Security Headers Middleware
 * 
 * Adds production-grade security headers to all API responses.
 * This middleware should be applied early in the middleware chain.
 */

/**
 * Get the frontend origin from environment
 */
function getFrontendOrigin(): string {
  return process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';
}

/**
 * Content Security Policy for API responses
 * Since this is an API server, we use a restrictive CSP that only allows
 * the frontend to make requests and prevents embedding in iframes.
 */
function getCSPHeaders(): Record<string, string> {
  const frontendOrigin = getFrontendOrigin();
  const isDevelopment = config.app.env === 'development';

  // For API responses, we primarily want to prevent embedding and restrict sources
  const cspDirectives = [
    "default-src 'none'", // API doesn't serve HTML/JS/CSS by default
    `connect-src 'self' ${frontendOrigin}`, // Allow frontend to connect
    "frame-ancestors 'none'", // Prevent clickjacking
    "base-uri 'self'",
    "form-action 'self'",
  ];

  // In development, be more permissive
  if (isDevelopment) {
    cspDirectives.push("connect-src 'self' *");
  }

  return {
    'Content-Security-Policy': cspDirectives.join('; '),
  };
}

/**
 * Get all security headers
 */
function getSecurityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',
    
    // Enable XSS protection (legacy but still useful)
    'X-XSS-Protection': '1; mode=block',
    
    // Control referrer information
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Restrict browser features
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
    
    // Remove server information
    'X-Powered-By': '', // Express adds this by default, we'll remove it
  };

  // Add HSTS only in production with HTTPS
  if (config.app.env === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  // Add CSP headers
  const cspHeaders = getCSPHeaders();
  Object.assign(headers, cspHeaders);

  // Add COOP/COEP for better isolation (optional, may break some integrations)
  // Uncomment if needed for your use case
  // headers['Cross-Origin-Opener-Policy'] = 'same-origin';
  // headers['Cross-Origin-Embedder-Policy'] = 'require-corp';

  return headers;
}

/**
 * Express middleware to add security headers
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headers = getSecurityHeaders();

  // Apply all security headers
  Object.entries(headers).forEach(([key, value]) => {
    if (value) {
      res.setHeader(key, value);
    }
  });

  // Remove X-Powered-By header (Express adds this by default)
  res.removeHeader('X-Powered-By');

  next();
}

/**
 * Report-Only CSP middleware for testing
 * Use this to test CSP violations without blocking requests
 */
export function cspReportOnlyMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (process.env.CSP_REPORT_ONLY === 'true') {
    const cspHeaders = getCSPHeaders();
    res.setHeader('Content-Security-Policy-Report-Only', cspHeaders['Content-Security-Policy']);
    
    if (process.env.CSP_REPORT_URI) {
      res.setHeader('Content-Security-Policy-Report-Only', 
        `${cspHeaders['Content-Security-Policy']}; report-uri ${process.env.CSP_REPORT_URI}`);
    }
  }
  next();
}
