# CSP Integration Testing Guide

## Overview

This guide provides step-by-step instructions for testing the Content Security Policy (CSP) and security headers implementation to ensure compatibility with wallet integrations, Monaco editor, analytics, and Stellar endpoints.

## Prerequisites

- Backend server running on port 8080
- Frontend server running on port 3000
- Browser with developer tools (Chrome/Firefox recommended)
- Wallet extensions installed (Freighter, Albedo, Rabet)

## Testing Strategy

### Phase 1: Report-Only Mode Testing

Before enforcing CSP, test in report-only mode to identify violations without blocking functionality.

#### Enable Report-Only Mode

**Backend (.env):**
```bash
CSP_REPORT_ONLY=true
```

**Frontend (.env.local):**
```bash
NEXT_PUBLIC_CSP_REPORT_ONLY=true
```

Restart both servers after changing these values.

#### Monitor CSP Violations

1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for CSP violation reports:
   ```
   [Report Only] Refused to load the script '...' because it violates the following Content Security Policy directive: ...
   ```
4. Document all violations

### Phase 2: Enforce Mode Testing

After fixing all report-only violations, test with enforce mode.

#### Enable Enforce Mode

**Backend (.env):**
```bash
CSP_REPORT_ONLY=false
```

**Frontend (.env.local):**
```bash
NEXT_PUBLIC_CSP_REPORT_ONLY=false
```

## Integration Testing Checklist

### 1. Wallet Integration Testing

#### Freighter Wallet
- [ ] Navigate to wallet connection page
- [ ] Click "Connect Freighter"
- [ ] Verify wallet popup opens
- [ ] Complete connection flow
- [ ] Verify public key is displayed
- [ ] Attempt to sign a transaction
- [ ] Verify transaction signing works
- [ ] Check console for CSP violations

#### Albedo Wallet
- [ ] Navigate to wallet connection page
- [ ] Click "Connect Albedo"
- [ ] Verify Albedo popup opens
- [ ] Complete connection flow
- [ ] Verify public key is displayed
- [ ] Attempt to sign a transaction
- [ ] Verify transaction signing works
- [ ] Check console for CSP violations

#### Rabet Wallet
- [ ] Navigate to wallet connection page
- [ ] Click "Connect Rabet"
- [ ] Verify Rabet popup opens
- [ ] Complete connection flow
- [ ] Verify public key is displayed
- [ ] Attempt to sign a transaction
- [ ] Verify transaction signing works
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- Wallet extensions communicate via injected window objects
- No CSP directives should block wallet communication
- No CSP violations should appear in console

### 2. Monaco Editor Testing

#### Editor Loading
- [ ] Navigate to a page with Monaco editor (e.g., playground)
- [ ] Verify editor loads correctly
- [ ] Verify syntax highlighting works
- [ ] Verify code completion works
- [ ] Check console for CSP violations

#### Editor Functionality
- [ ] Type code in the editor
- [ ] Verify autocomplete suggestions appear
- [ ] Use keyboard shortcuts (Ctrl+S, Ctrl+F, etc.)
- [ ] Verify editor themes work
- [ ] Verify minimap displays correctly
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- Monaco is bundled locally, no external CDN requests
- Worker scripts should load from same origin
- No CSP violations should appear

### 3. Stellar Network Integration Testing

#### Soroban RPC
- [ ] Navigate to a page that uses Soroban RPC
- [ ] Trigger an RPC call (e.g., contract invocation)
- [ ] Verify request succeeds
- [ ] Check Network tab for request details
- [ ] Verify request goes to allowed origin
- [ ] Check console for CSP violations

#### Horizon API
- [ ] Navigate to a page that uses Horizon API
- [ ] Trigger an API call (e.g., account lookup)
- [ ] Verify request succeeds
- [ ] Check Network tab for request details
- [ ] Verify request goes to allowed origin
- [ ] Check console for CSP violations

#### Block Explorer Links
- [ ] Navigate to a page with block explorer links
- [ ] Click on a transaction hash link
- [ ] Verify stellar.expert opens in new tab
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- All Stellar endpoints should be in connect-src
- Requests should succeed without CSP violations
- External links should open in new tabs

### 4. WebSocket Connection Testing

#### Backend WebSocket
- [ ] Navigate to a page with WebSocket functionality
- [ ] Verify WebSocket connection establishes
- [ ] Verify real-time updates work
- [ ] Check Network tab for WebSocket connection
- [ ] Verify connection goes to allowed origin
- [ ] Check console for CSP violations

#### Yjs Collaboration
- [ ] Open a collaborative editing page
- [ ] Verify Yjs connection establishes
- [ ] Verify collaborative features work
- [ ] Check Network tab for WebSocket connection
- [ ] Verify connection goes to allowed origin
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- WebSocket endpoints should be in connect-src
- Connections should establish without CSP violations

### 5. Analytics Dashboard Testing

#### Dashboard Loading
- [ ] Navigate to `/analytics` page
- [ ] Verify dashboard loads
- [ ] Verify charts render correctly
- [ ] Check console for CSP violations

#### Chart Interactions
- [ ] Hover over chart elements
- [ ] Verify tooltips appear
- [ ] Change date range filters
- [ ] Verify charts update
- [ ] Export data as CSV
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- Analytics components use local libraries (recharts)
- No external analytics scripts (Google Analytics, etc.)
- No CSP violations should appear

### 6. API Integration Testing

#### Backend API Calls
- [ ] Navigate to a page that makes API calls
- [ ] Trigger an API request
- [ ] Verify request succeeds
- [ ] Check Network tab for request details
- [ ] Verify request goes to allowed origin
- [ ] Check console for CSP violations

#### GraphQL API
- [ ] Navigate to GraphQL playground (if accessible)
- [ ] Execute a GraphQL query
- [ ] Verify query succeeds
- [ ] Check Network tab for request details
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- API endpoints should be in connect-src
- Requests should succeed without CSP violations

### 7. Image Loading Testing

#### Avatar Images
- [ ] Navigate to a page with user avatars
- [ ] Verify avatars load
- [ ] Check Network tab for image requests
- [ ] Check console for CSP violations

#### Chart Images
- [ ] Navigate to analytics dashboard
- [ ] Export chart as PNG
- [ ] Verify export works
- [ ] Check console for CSP violations

#### External Images
- [ ] Navigate to a page with external images (if any)
- [ ] Verify images load
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- Images should load from allowed origins
- data: and blob: URLs should work
- No CSP violations should appear

### 8. Form Submission Testing

#### Login Form
- [ ] Navigate to login page
- [ ] Submit login form
- [ ] Verify submission succeeds
- [ ] Check console for CSP violations

#### Registration Form
- [ ] Navigate to registration page
- [ ] Submit registration form
- [ ] Verify submission succeeds
- [ ] Check console for CSP violations

**Expected CSP Behavior:**
- Form submissions should go to same origin
- form-action directive should allow submissions
- No CSP violations should appear

## Security Headers Verification

### Frontend Headers

1. Open browser DevTools (F12)
2. Go to Network tab
3. Reload the page
4. Click on the main document request
5. Check Response Headers

Verify the following headers are present:
- [ ] Content-Security-Policy
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()
- [ ] Strict-Transport-Security: max-age=31536000; includeSubDomains; preload (production only)
- [ ] Cross-Origin-Embedder-Policy: require-corp
- [ ] Cross-Origin-Opener-Policy: same-origin

### Backend Headers

1. Use curl or a similar tool:
```bash
curl -I http://localhost:8080/health
```

Verify the following headers are present:
- [ ] Content-Security-Policy
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()
- [ ] Strict-Transport-Security: max-age=31536000; includeSubDomains; preload (production only)
- [ ] X-Powered-By should NOT be present

## Automated Testing

Run the automated test suites:

### Frontend Tests
```bash
cd frontend
npm test -- src/lib/security/__tests__/csp-config.test.ts
```

### Backend Tests
```bash
cd backend
npm test -- middleware/__tests__/securityHeaders.test.ts
```

## Troubleshooting

### Common Issues

#### Wallet Connection Fails
**Symptom:** Wallet popup doesn't open or connection fails
**Possible Causes:**
- CSP blocking extension communication
- Extension not installed
**Solution:**
- Wallet extensions use window objects, not CSP-controlled resources
- Check browser console for JavaScript errors (not CSP violations)
- Verify extension is installed and enabled

#### Monaco Editor Doesn't Load
**Symptom:** Editor shows blank or error
**Possible Causes:**
- CSP blocking worker scripts
- Missing nonce on script tags
**Solution:**
- Verify worker-src includes 'self' and blob:
- Check that Monaco scripts have nonce attributes
- Review CSP violation reports in console

#### Stellar RPC Calls Fail
**Symptom:** RPC calls fail with network error
**Possible Causes:**
- Stellar endpoints not in connect-src
- CORS issues
**Solution:**
- Verify Stellar endpoints are in CSP connect-src
- Check backend CORS configuration
- Review Network tab for blocked requests

#### WebSocket Connection Fails
**Symptom:** WebSocket connection fails
**Possible Causes:**
- WebSocket URL not in connect-src
- Wrong protocol (ws vs wss)
**Solution:**
- Verify WebSocket URL is in connect-src
- Ensure correct protocol (ws for dev, wss for prod)
- Check WebSocket server is running

#### Images Don't Load
**Symptom:** Images appear broken
**Possible Causes:**
- Image source not in img-src
- External image domain not allowed
**Solution:**
- Add image domain to img-src directive
- Use data: URLs for small images
- Check CSP violation reports

### Debug Mode

Enable detailed CSP violation reporting:

**Frontend (next.config.ts):**
```typescript
// Add report-uri for detailed reporting
reportUri: 'http://localhost:8080/api/csp-reports'
```

**Backend:**
Create an endpoint to receive CSP reports:
```typescript
app.post('/api/csp-reports', express.json(), (req, res) => {
  console.log('CSP Violation:', req.body);
  res.status(204).end();
});
```

## Test Results Template

Use this template to document test results:

```markdown
# CSP Integration Test Results

**Date:** [Date]
**Tester:** [Name]
**Environment:** [Development/Staging/Production]
**CSP Mode:** [Report-Only/Enforce]

## Test Results

### Wallet Integration
- Freighter: [Pass/Fail] - Notes
- Albedo: [Pass/Fail] - Notes
- Rabet: [Pass/Fail] - Notes

### Monaco Editor
- Loading: [Pass/Fail] - Notes
- Functionality: [Pass/Fail] - Notes

### Stellar Integration
- Soroban RPC: [Pass/Fail] - Notes
- Horizon API: [Pass/Fail] - Notes
- Block Explorer: [Pass/Fail] - Notes

### WebSocket
- Backend WebSocket: [Pass/Fail] - Notes
- Yjs Collaboration: [Pass/Fail] - Notes

### Analytics
- Dashboard Loading: [Pass/Fail] - Notes
- Chart Interactions: [Pass/Fail] - Notes

### API Integration
- REST API: [Pass/Fail] - Notes
- GraphQL API: [Pass/Fail] - Notes

### Security Headers
- Frontend Headers: [Pass/Fail] - Notes
- Backend Headers: [Pass/Fail] - Notes

## CSP Violations Found

[List any CSP violations found during testing]

## Issues and Resolutions

[Document any issues found and how they were resolved]

## Recommendations

[Any recommendations for improving the CSP configuration]
```

## Sign-off Criteria

The CSP implementation is ready for production when:

- [ ] All integration tests pass
- [ ] No CSP violations in report-only mode
- [ ] All features work in enforce mode
- [ ] Security headers are verified
- [ ] Automated tests pass
- [ ] Documentation is complete
- [ ] Team has reviewed and approved

## Contact

For issues or questions about CSP testing:
- Review the main CSP documentation: `docs/SECURITY_HEADERS_AND_CSP.md`
- Open a GitHub issue with the `security` label
- Contact the security team
