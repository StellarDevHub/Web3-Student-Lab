import { describe, expect, it } from 'vitest';
import {
  maskAddress,
  redactDeep,
  redactString,
  redactUrl,
  scrubBreadcrumb,
  scrubEvent,
} from '../redact';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const MUXED = `M${'A'.repeat(68)}`;
const SECRET = `S${'A'.repeat(55)}`;

describe('maskAddress', () => {
  it('keeps the first and last four characters', () => {
    expect(maskAddress(ACCOUNT)).toBe('GAAA…AWHF');
    expect(maskAddress(ACCOUNT)).toHaveLength(9);
  });

  it('never returns enough to reconstruct the address', () => {
    expect(maskAddress(ACCOUNT)).not.toContain(ACCOUNT.slice(4, -4));
  });

  it('redacts values too short to mask meaningfully', () => {
    expect(maskAddress('GABC')).toBe('[redacted]');
  });
});

describe('redactString', () => {
  it('masks account, contract and muxed addresses', () => {
    const out = redactString(`from ${ACCOUNT} to ${CONTRACT} via ${MUXED}`);
    expect(out).not.toContain(ACCOUNT);
    expect(out).not.toContain(CONTRACT);
    expect(out).not.toContain(MUXED);
    expect(out).toBe(
      `from ${maskAddress(ACCOUNT)} to ${maskAddress(CONTRACT)} via ${maskAddress(MUXED)}`
    );
  });

  it('removes Stellar secret seeds entirely, not just masks them', () => {
    const out = redactString(`key=${SECRET}`);
    expect(out).toBe('key=[redacted-secret]');
    expect(out).not.toContain('SAAAA');
  });

  it('removes emails, bearer tokens and JWTs', () => {
    expect(redactString('contact student@example.com now')).toBe('contact [email] now');
    expect(redactString('Authorization: Bearer abc.def-123_456')).toContain('Bearer [token]');
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
    expect(redactString(`token ${jwt}`)).toBe('token [jwt]');
  });

  it('leaves ordinary text alone', () => {
    expect(redactString('Cannot read properties of undefined (reading "map")')).toBe(
      'Cannot read properties of undefined (reading "map")'
    );
  });
});

describe('redactUrl', () => {
  it('keeps the path and reduces a query string to a marker', () => {
    expect(redactUrl('https://app.example/courses/12?token=abc&addr=G123#frag')).toBe(
      '/courses/12?[redacted]'
    );
  });

  it('drops the origin and any fragment', () => {
    expect(redactUrl('https://app.example/dashboard')).toBe('/dashboard');
    expect(redactUrl('/dashboard#secret')).toBe('/dashboard');
  });

  it('masks an address that appears in the path', () => {
    expect(redactUrl(`https://app.example/accounts/${ACCOUNT}`)).toBe(
      `/accounts/${maskAddress(ACCOUNT)}`
    );
  });
});

describe('redactDeep', () => {
  it('redacts strings at any depth', () => {
    const out = redactDeep({ a: { b: [`wallet ${ACCOUNT}`] } });
    expect(JSON.stringify(out)).not.toContain(ACCOUNT);
  });

  it('drops the value of sensitive keys whatever it holds', () => {
    const out = redactDeep({
      password: 'hunter2',
      apiToken: 'abc',
      mnemonic: 'word word word',
      Authorization: 'x',
      email: 'a@b.co',
      safe: 'fine',
    });
    expect(out).toEqual({
      password: '[redacted]',
      apiToken: '[redacted]',
      mnemonic: '[redacted]',
      Authorization: '[redacted]',
      email: '[redacted]',
      safe: 'fine',
    });
  });

  it('caps depth, array length and string length', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: 'x' } } } } } } };
    expect(JSON.stringify(redactDeep(deep))).toContain('[truncated]');
    expect(redactDeep(Array.from({ length: 500 }, (_, i) => i))).toHaveLength(60);
    expect((redactDeep('a'.repeat(5000)) as string).length).toBeLessThan(2100);
  });

  it('passes primitives through', () => {
    expect(redactDeep(42)).toBe(42);
    expect(redactDeep(null)).toBeNull();
    expect(redactDeep(true)).toBe(true);
  });
});

describe('scrubEvent (Sentry beforeSend)', () => {
  it('scrubs the exception message, message and breadcrumbs', () => {
    const event = scrubEvent({
      message: `failed for ${ACCOUNT}`,
      exception: { values: [{ value: `bad ${SECRET} and me@x.io` }] },
      breadcrumbs: [{ message: `Clicked ${ACCOUNT}` }],
    });
    const json = JSON.stringify(event);
    expect(json).not.toContain(ACCOUNT);
    expect(json).not.toContain('SAAAA');
    expect(json).not.toContain('me@x.io');
  });

  it('reduces the request to a path and drops cookies, headers and bodies', () => {
    const event = scrubEvent({
      request: {
        url: 'https://app.example/lessons/3?session=abc',
        cookies: { sid: '1' },
        headers: { authorization: 'Bearer x' },
        data: { password: 'p' },
        query_string: 'session=abc',
      },
    });
    expect(event.request).toEqual({ url: '/lessons/3?[redacted]' });
  });

  it('keeps only the user id, and drops ip, email and username', () => {
    const event = scrubEvent({
      user: { id: maskAddress(ACCOUNT), email: 'a@b.co', ip_address: '1.2.3.4', username: 'bob' },
    });
    expect(event.user).toEqual({ id: maskAddress(ACCOUNT) });
  });

  it('removes a user with no id rather than keeping other fields', () => {
    expect(scrubEvent({ user: { email: 'a@b.co' } }).user).toEqual({});
  });

  it('scrubs contexts, extra and tags', () => {
    const event = scrubEvent({
      contexts: { state: { wallet: ACCOUNT, password: 'p' } },
      extra: { note: ACCOUNT },
      tags: { who: ACCOUNT },
    });
    const json = JSON.stringify(event);
    expect(json).not.toContain(ACCOUNT);
    expect(json).not.toContain('"password":"p"');
  });
});

describe('scrubBreadcrumb (Sentry beforeBreadcrumb)', () => {
  it('scrubs the message and reduces url data to a path', () => {
    const crumb = scrubBreadcrumb({
      message: `GET ${ACCOUNT}`,
      data: { url: 'https://api.example/v1/profile?token=abc', method: 'GET' },
    });
    expect(crumb.message).toBe(`GET ${maskAddress(ACCOUNT)}`);
    expect(crumb.data).toEqual({ url: '/v1/profile?[redacted]', method: 'GET' });
  });

  it('reduces navigation from/to to paths', () => {
    const crumb = scrubBreadcrumb({
      data: { from: 'https://a.example/x?k=1', to: 'https://a.example/y#h' },
    });
    expect(crumb.data).toEqual({ from: '/x?[redacted]', to: '/y' });
  });

  it('handles a breadcrumb with no message or data', () => {
    expect(scrubBreadcrumb({})).toEqual({});
  });
});
