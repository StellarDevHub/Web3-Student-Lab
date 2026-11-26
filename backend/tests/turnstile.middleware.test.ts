import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { requireTurnstile } from '../src/middleware/turnstile.js';

describe('Turnstile middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.TURNSTILE_SECRET;
  const originalHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;

  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET;
    delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.TURNSTILE_SECRET = originalSecret;
    process.env.TURNSTILE_EXPECTED_HOSTNAME = originalHostname;
    jest.restoreAllMocks();
  });

  function makeRequest(body: unknown = {}, headerToken?: string): Request {
    return {
      body,
      ip: '203.0.113.10',
      get: jest.fn().mockReturnValue(headerToken),
    } as unknown as Request;
  }

  function makeResponse(): Response {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
  }

  it('rejects a missing token with 403', async () => {
    process.env.NODE_ENV = 'development';
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    await requireTurnstile()(makeRequest(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('verifies the supplied token with Cloudflare before continuing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET = 'test-secret';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, hostname: 'example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    await requireTurnstile('example.com')(
      makeRequest({ 'cf-turnstile-response': 'valid-token' }),
      res,
      next,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      }),
    );
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('secret')).toBe('test-secret');
    expect(body.get('response')).toBe('valid-token');
    expect(body.get('remoteip')).toBe('203.0.113.10');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 403', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET = 'test-secret';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    await requireTurnstile()(
      makeRequest({ turnstileToken: 'invalid-token' }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('bypasses verification only in the test environment', async () => {
    process.env.NODE_ENV = 'test';
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const next = jest.fn() as NextFunction;

    await requireTurnstile()(makeRequest(), makeResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
