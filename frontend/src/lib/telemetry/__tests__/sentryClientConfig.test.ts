import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

async function loadOptions() {
  vi.resetModules();
  sentry.init.mockClear();
  await import('../../../../sentry.client.config');
  expect(sentry.init).toHaveBeenCalledTimes(1);
  return sentry.init.mock.calls[0][0] as Record<string, any>;
}

describe('sentry.client.config (FE-099)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('never lets Sentry attach default PII', async () => {
    expect((await loadOptions()).sendDefaultPii).toBe(false);
  });

  it('keeps a bounded breadcrumb trail', async () => {
    expect((await loadOptions()).maxBreadcrumbs).toBe(50);
  });

  it('scrubs events before they are sent', async () => {
    const options = await loadOptions();
    const event = options.beforeSend({
      exception: { values: [{ value: `failed for ${ACCOUNT}` }] },
      request: { url: 'https://app.example/x?token=abc', cookies: { a: 'b' } },
      user: { id: 'GAAA…AWHF', email: 'a@b.co', ip_address: '1.2.3.4' },
    });
    const json = JSON.stringify(event);
    expect(json).not.toContain(ACCOUNT);
    expect(json).not.toContain('token=abc');
    expect(json).not.toContain('a@b.co');
    expect(json).not.toContain('1.2.3.4');
    expect(event.user).toEqual({ id: 'GAAA…AWHF' });
  });

  it('scrubs breadcrumbs as they are recorded', async () => {
    const options = await loadOptions();
    const crumb = options.beforeBreadcrumb({
      category: 'fetch',
      message: `GET ${ACCOUNT}`,
      data: { url: 'https://api.example/v1/me?token=abc' },
    });
    expect(JSON.stringify(crumb)).not.toContain(ACCOUNT);
    expect(crumb.data.url).toBe('/v1/me?[redacted]');
  });

  it('initialises without a DSN (Sentry treats that as disabled)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('SENTRY_DSN', '');
    expect((await loadOptions()).dsn).toBeFalsy();
  });

  it('uses the public DSN when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1');
    expect((await loadOptions()).dsn).toBe('https://key@o0.ingest.sentry.io/1');
  });
});
