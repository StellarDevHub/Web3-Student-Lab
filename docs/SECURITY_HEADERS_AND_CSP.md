# Security Headers and Content Security Policy Documentation

## Overview

This document describes the production-grade security headers and Content Security Policy (CSP) implementation for the Web3 Student Lab platform. The implementation provides robust browser security protections while maintaining compatibility with wallet integrations, Monaco editor, analytics, and Stellar network endpoints.

## Architecture

### Frontend (Next.js)
- **Configuration File**: `frontend/src/lib/security/csp-config.ts`
- **Applied Via**: `frontend/next.config.ts` headers function
- **Mode**: Environment-aware (development/production/report-only)

### Backend (Express)
- **Middleware File**: `backend/src/middleware/securityHeaders.ts`
- **Applied Via**: `backend/src/index.ts` middleware chain
- **Mode**: Environment-aware with HSTS in production

## Approved Third-Party Origins

### 1. Stellar Network Endpoints

These endpoints are required for blockchain interactions:

- **Soroban RPC**: `https://soroban-testnet.stellar.org`
- **Alternative Soroban RPC**: `https://soroban-test.stellar.org:443`
- **Horizon API**: `https://horizon-testnet.stellar.org`
- **Block Explorer**: `https://stellar.expert`

### 2. Wallet Integrations

Wallet extensions communicate via injected window objects and do not require CSP directives:

- **Freighter** (Chrome/Firefox extension)
- **Albedo** (web-based, opens popup)
- **Rabet** (Chrome extension)

### 3. Monaco Editor

Monaco editor is bundled locally and does not require external CDN access.

### 4. WebSocket Connections

WebSocket endpoints are configurable via environment variables:

- **Backend WebSocket**: Configured via `NEXT_PUBLIC_WS_URL`
- **Yjs Collaboration Server**: Configured via `NEXT_PUBLIC_WS_URL`

### 5. Backend API

API endpoints are configurable via environment variables:

- **API Base URL**: Configured via `NEXT_PUBLIC_API_URL`

## CSP Directives

### Frontend CSP (Production)

```
default-src 'self';
script-src 'self' 'nonce-{nonce}';
style-src 'self' 'nonce-{nonce}' 'unsafe-inline';
img-src 'self' data: blob: https: https://stellar.expert;
font-src 'self' data:;
connect-src 'self' 
  {API_ORIGIN} 
  {WS_ORIGIN} 
  https://soroban-testnet.stellar.org 
  https://soroban-test.stellar.org:443 
  https://horizon-testnet.stellar.org 
  https://stellar.expert;
frame-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
block-all-mixed-content;
upgrade-insecure-requests;
worker-src 'self' blob:;
manifest-src 'self';
```

### Backend CSP (Production)

```
default-src 'none';
connect-src 'self' {FRONTEND_URL};
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

## Security Headers

### Frontend Headers

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | (see above) | Restricts resource loading |
| X-Content-Type-Options | nosniff | Prevents MIME sniffing |
| X-Frame-Options | DENY | Prevents clickjacking |
| X-XSS-Protection | 1; mode=block | Legacy XSS protection |
| Referrer-Policy | strict-origin-when-cross-origin | Controls referrer info |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=() | Restricts browser features |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload | Enforces HTTPS |
| Cross-Origin-Embedder-Policy | require-corp | Isolation |
| Cross-Origin-Opener-Policy | same-origin | Isolation |

### Backend Headers

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | (see above) | Restricts resource loading |
| X-Content-Type-Options | nosniff | Prevents MIME sniffing |
| X-Frame-Options | DENY | Prevents clickjacking |
| X-XSS-Protection | 1; mode=block | Legacy XSS protection |
| Referrer-Policy | strict-origin-when-cross-origin | Controls referrer info |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=() | Restricts browser features |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload (production only) | Enforces HTTPS |
| X-Powered-By | (removed) | Hides server info |

## Environment Variables

### Backend (.env)

```bash
# Frontend URL for CORS and CSP
FRONTEND_URL=http://localhost:3000

# Content Security Policy Configuration
CSP_REPORT_ONLY=false
BACKEND_CSP_REPORT_ONLY=false

# Optional: CSP Report URI
# CSP_REPORT_URI=https://your-csp-report-endpoint.com/api/csp-reports
```

### Frontend (.env.local)

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000

# CSP Configuration
NEXT_PUBLIC_CSP_REPORT_ONLY=false
NEXT_PUBLIC_CSP_REPORT_URI=

# Stellar Configuration
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

## Deployment Strategy

### Staged Rollout

1. **Development**: Use development CSP (more permissive)
2. **Staging**: Enable report-only mode to monitor violations
3. **Production**: Enable enforce mode with strict CSP

### Report-Only Mode

To test CSP without blocking requests:

**Backend:**
```bash
CSP_REPORT_ONLY=true
```

**Frontend:**
```bash
NEXT_PUBLIC_CSP_REPORT_ONLY=true
```

### Monitoring CSP Violations

Set up a CSP report endpoint to receive violation reports:

```bash
CSP_REPORT_URI=https://your-domain.com/api/csp-reports
```

## Testing

### Manual Testing Checklist

- [ ] Wallet connection (Freighter, Albedo, Rabet)
- [ ] Transaction signing
- [ ] Monaco editor loading and functionality
- [ ] Stellar RPC calls (Soroban, Horizon)
- [ ] WebSocket connections
- [ ] Analytics dashboard
- [ ] Image loading (avatars, charts)
- [ ] Form submissions
- [ ] API calls to backend

### Automated Testing

See test files:
- `frontend/src/lib/security/__tests__/csp-config.test.ts`
- `backend/src/middleware/__tests__/securityHeaders.test.ts`

## Troubleshooting

### Common CSP Violations

1. **Inline Scripts**: Use nonce-based loading instead of inline scripts
2. **Dynamic Script Loading**: Ensure scripts are loaded from allowed origins
3. **WebSocket Connection**: Verify WS URL is in connect-src
4. **Image Loading**: Ensure image sources are in img-src

### Debug Mode

Enable development mode to see detailed CSP violations in browser console:

```bash
NODE_ENV=development
```

### Browser DevTools

Check CSP violations:
1. Open DevTools (F12)
2. Go to Console tab
3. Look for CSP violation reports
4. Check Network tab for blocked requests

## Security Best Practices

1. **Never expose secrets**: CSP violation reports should not contain sensitive data
2. **Regular audits**: Review and update allowed origins quarterly
3. **Monitor violations**: Set up alerts for CSP violation reports
4. **Keep dependencies updated**: Regularly update security-related packages
5. **Test in report-only mode**: Always test CSP changes in report-only mode first

## Compliance

This implementation follows:
- OWASP CSP guidelines
- MDN Web Security recommendations
- Next.js security best practices
- Express.js security best practices

## References

- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Next.js Security Headers](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [Express Helmet](https://helmetjs.github.io/)

## Maintenance

### Adding New Third-Party Origins

1. Document the origin in this file
2. Add to appropriate CSP directive in `csp-config.ts`
3. Test in report-only mode
4. Deploy to production after validation

### Removing Origins

1. Verify no active dependencies
2. Remove from CSP configuration
3. Test thoroughly
4. Deploy to production

## Contact

For security-related questions or to report vulnerabilities:
- Open a GitHub issue with the `security` label
- Contact the security team via the repository's security email
