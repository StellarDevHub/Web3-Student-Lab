## Summary

This PR delivers the full backend resilience package for the four tracked issues in the authentication, notification, document, and data-retention domains.

It includes:
- BE-041: resilient SES-first email delivery with Postmark failover for transactional notifications
- BE-040: PDF certificate generation engine with embedded cryptographic metadata and verification signing
- BE-039: full SEP-10 Stellar Web Authentication challenge generation and verification flow
- BE-038: automated pruning worker and retention policy enforcement for expired auth state and stale operational data

## What changed

### Email reliability and failover
- Added a multi-provider email orchestration layer with SES as the primary provider
- Added automatic fallback to Postmark when SES delivery fails or rate limits are encountered
- Kept queue-based email dispatch compatible with the existing delivery pipeline
- Preserved the existing email payload shape while centralizing provider selection logic

### PDF certificate generation
- Added a server-side PDF certificate generation pipeline using pdf-lib
- Embedded institution metadata, certificate details, and verification QR payloads
- Added cryptographically signed certificate metadata for verification and tamper detection
- Included deterministic signature handling for signed document integrity validation

### Stellar SEP-10 authentication
- Implemented challenge transaction generation with nonce binding and expiration handling
- Added protected signature verification against Stellar account keys and signer thresholds
- Enforced replay protection and challenge reuse checks
- Issued authenticated JWT tokens with wallet and nonce claims on successful verification

### Data retention and cleanup
- Added a scheduled maintenance job for expired session cleanup and retention enforcement
- Implemented pruning logic for expired refresh tokens, stale rate-limit logs, and historical exercise attempts
- Added SQL retention queries to support archive and purge operations for compliance-driven cleanup

## Why

These changes address critical operational and security gaps across the backend:
- message delivery reliability for security-sensitive notifications
- verifiable certificate issuance and downstream trust
- Stellar ecosystem compliance for wallet-based authentication
- compliance-safe cleanup of stale operational data and tokens

## Validation

- Reviewed the affected provider, auth, certificate, and retention paths for integration consistency
- Verified the updated backend modules compile cleanly in isolation for the targeted implementation surface
- Confirmed the resulting flow preserves compatibility with the existing queue, auth, and certificate infrastructure

## Notes

This PR is intentionally scoped to the implementation of the requested backend resilience and verification work across the four related issues and avoids unrelated refactors or opportunistic cleanup.
