import { describe, expect, it } from 'vitest';
import {
  REDACTED_AUTH_PLACEHOLDER,
  REDACTED_SECRET_PLACEHOLDER,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSensitiveString,
} from '../sentryScrubber';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

const SAMPLE_STELLAR_SECRET =
  'SBZ26X73456723456723456723456723456723456723456723456723';

describe('Automated Client-Side Error Boundary & Sentry Telemetry Scrubber (#1557)', () => {
  it('strips Stellar secret keys (S...) and Bearer tokens from telemetry strings', () => {
    const raw = `Failed signing with key ${SAMPLE_STELLAR_SECRET} and header Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig`;
    const scrubbed = scrubSensitiveString(raw);
    expect(scrubbed).not.toContain(SAMPLE_STELLAR_SECRET);
    expect(scrubbed).toContain(REDACTED_SECRET_PLACEHOLDER);
    expect(scrubbed).toContain(`Bearer ${REDACTED_AUTH_PLACEHOLDER}`);
  });

  it('scrubs authorization headers, passkey credentials, and seeds from Sentry events and breadcrumbs', () => {
    const event = {
      message: `Leak test: ${SAMPLE_STELLAR_SECRET}`,
      request: {
        headers: {
          Authorization: 'Bearer secret-jwt',
          'X-Custom': 'safe-value',
        },
      },
      extra: {
        passkey: 'raw-webauthn-attestation',
        seed: 'twelve word mnemonic',
      },
    };
    const cleaned = scrubSentryEvent(event);
    expect(cleaned.message).toContain(REDACTED_SECRET_PLACEHOLDER);
    expect(cleaned.request.headers.Authorization).toBe(REDACTED_AUTH_PLACEHOLDER);
    expect(cleaned.request.headers['X-Custom']).toBe('safe-value');
    expect(cleaned.extra.passkey).toBe(REDACTED_AUTH_PLACEHOLDER);
    expect(cleaned.extra.seed).toBe(REDACTED_AUTH_PLACEHOLDER);

    const crumb = scrubSentryBreadcrumb({
      category: 'auth',
      message: `Using ${SAMPLE_STELLAR_SECRET}`,
    });
    expect(crumb.message).toBe(`Using ${REDACTED_SECRET_PLACEHOLDER}`);
  });

  it('derives sanitized state in ErrorBoundary and supports Reload Component reset', () => {
    const derived = ErrorBoundary.getDerivedStateFromError(
      new Error(`Crash with ${SAMPLE_STELLAR_SECRET}`)
    );
    expect(derived.hasError).toBe(true);
    expect(derived.sanitizedMessage).not.toContain(SAMPLE_STELLAR_SECRET);
    expect(derived.sanitizedMessage).toContain(REDACTED_SECRET_PLACEHOLDER);
  });
});
