import type * as Sentry from '@sentry/node';
import {
  getTracesSampleRate,
  sentryBeforeBreadcrumb,
  sentryBeforeSend,
} from '../src/utils/sentry.js';

describe('Sentry PII Scrubbing, Error Filtering, and Trace Sampling (BE-076)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('redacts password, secret, authorization, cookie, walletPrivateKey, and Bearer tokens in beforeSend', () => {
    const event: Sentry.ErrorEvent = {
      type: undefined,
      event_id: 'evt-1',
      environment: 'production',
      request: {
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
          cookie: 'session_id=abc123; theme=dark',
          'user-agent': 'jest-test',
        },
        data: {
          password: 'super-secret-password',
          secret: 'top-secret-value',
          walletPrivateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          username: 'student1',
        },
      },
      extra: {
        authHeader: 'Bearer my-jwt-token-123',
        nested: {
          walletPrivateKey: '0x1234567890abcdef',
          password: 'nested-password',
        },
      },
      breadcrumbs: [
        {
          message: 'Auth failed with Bearer abc.def.ghi',
          data: {
            authorization: 'Bearer secret-token',
            cookie: 'sid=xyz',
            password: 'crumb-password',
          },
        },
      ],
    };

    const result = sentryBeforeSend(event);
    expect(result).not.toBeNull();
    expect(result?.request?.headers).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'user-agent': 'jest-test',
    });
    expect(result?.request?.data).toEqual({
      password: '[REDACTED]',
      secret: '[REDACTED]',
      walletPrivateKey: '[REDACTED]',
      username: 'student1',
    });
    expect(result?.extra).toEqual({
      authHeader: 'Bearer [REDACTED]',
      nested: {
        walletPrivateKey: '[REDACTED]',
        password: '[REDACTED]',
      },
    });
    expect(result?.breadcrumbs?.[0]).toEqual({
      message: 'Auth failed with Bearer [REDACTED]',
      data: {
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        password: '[REDACTED]',
      },
    });
  });

  it('redacts sensitive fields in beforeBreadcrumb', () => {
    const crumb: Sentry.Breadcrumb = {
      category: 'http',
      message: 'Request with Bearer tok_98765',
      data: {
        authorization: 'Bearer tok_98765',
        cookie: 'session=123',
        secret: 's3cr3t',
        walletPrivateKey: '0xdeadbeef',
        url: '/api/v1/profile',
      },
    };

    const scrubbed = sentryBeforeBreadcrumb(crumb);
    expect(scrubbed).toEqual({
      category: 'http',
      message: 'Request with Bearer [REDACTED]',
      data: {
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        secret: '[REDACTED]',
        walletPrivateKey: '[REDACTED]',
        url: '/api/v1/profile',
      },
    });
  });

  it('filters out high-volume routine 4xx and validation errors', () => {
    const baseEvent: Sentry.ErrorEvent = {
      type: undefined,
      event_id: 'evt-4xx',
    };

    const notFoundErr = Object.assign(new Error('Not found'), { status: 404 });
    expect(sentryBeforeSend(baseEvent, { originalException: notFoundErr })).toBeNull();

    const badRequestErr = Object.assign(new Error('Invalid input'), { statusCode: 400 });
    expect(sentryBeforeSend(baseEvent, { originalException: badRequestErr })).toBeNull();

    const zodErr = new Error('Invalid payload');
    zodErr.name = 'ZodError';
    expect(sentryBeforeSend(baseEvent, { originalException: zodErr })).toBeNull();

    const responseContext404: Sentry.ErrorEvent = {
      type: undefined,
      contexts: { response: { status_code: 404 } },
    };
    expect(sentryBeforeSend(responseContext404)).toBeNull();
  });

  it('preserves critical 500 exceptions with complete error stacks and environment tags', () => {
    const criticalErr = Object.assign(new Error('Database connection lost'), { status: 500 });
    const event: Sentry.ErrorEvent = {
      type: undefined,
      event_id: 'evt-500',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Database connection lost',
            stacktrace: {
              frames: [
                { filename: 'src/db/pool.ts', function: 'query', lineno: 42 },
              ],
            },
          },
        ],
      },
      tags: { service: 'backend' },
    };

    const result = sentryBeforeSend(event, { originalException: criticalErr });
    expect(result).not.toBeNull();
    expect(result?.environment).toBe('production');
    expect(result?.tags).toEqual({
      service: 'backend',
      environment: 'production',
    });
    expect(result?.exception?.values?.[0]?.stacktrace?.frames).toHaveLength(1);
    expect(result?.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe('src/db/pool.ts');
  });

  it('sets production trace sampling to 10% and non-production to 100%', () => {
    expect(getTracesSampleRate('production')).toBe(0.1);
    expect(getTracesSampleRate('development')).toBe(1.0);
    expect(getTracesSampleRate('staging')).toBe(1.0);
  });
});
