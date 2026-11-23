import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

/**
 * Threat detection + security telemetry tests (#1425 / BE-HARD-34).
 */

const mockCaptureMessage = jest.fn();

jest.mock('../src/utils/sentry.js', () => ({
  __esModule: true,
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  captureException: jest.fn(),
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  traceContext: { run: (_store: unknown, fn: () => void) => fn() },
  getTraceId: () => undefined,
}));

import { detectThreats, threatDetection } from '../src/middleware/threatDetection.js';

const buildReq = (overrides: Partial<Request> = {}): Request =>
  ({
    method: 'POST',
    url: '/api/v1/things',
    originalUrl: '/api/v1/things',
    ip: '127.0.0.1',
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  }) as unknown as Request;

describe('detectThreats (#1425)', () => {
  it('detects SQL injection payloads in the body', () => {
    const threats = detectThreats(buildReq({ body: { q: "1' OR 1=1 --" } }));
    expect(threats.some((t) => t.type === 'sql_injection')).toBe(true);
  });

  it('detects XSS payloads in query strings', () => {
    const threats = detectThreats(buildReq({ query: { name: '<script>alert(1)</script>' } as any }));
    expect(threats.some((t) => t.type === 'xss')).toBe(true);
  });

  it('detects prototype pollution keys', () => {
    // JSON.parse creates an own enumerable `__proto__` property (an object
    // literal would set the prototype instead).
    const body = JSON.parse('{"__proto__": {"polluted": true}}');
    const threats = detectThreats(buildReq({ body }));
    expect(threats.some((t) => t.type === 'prototype_pollution')).toBe(true);
  });

  it('returns no threats for a clean request', () => {
    expect(detectThreats(buildReq({ body: { name: 'Alice', courseId: 'c1' } }))).toHaveLength(0);
  });

  it('sanitizes secrets inside the captured threat sample', () => {
    const seed = `S${'A'.repeat(55)}`;
    const threats = detectThreats(buildReq({ body: { q: `union select ${seed}` } }));
    expect(threats[0]?.sample).not.toContain(seed);
  });
});

describe('threatDetection middleware (#1425)', () => {
  beforeEach(() => mockCaptureMessage.mockClear());

  it('always calls next() and streams telemetry on detection', () => {
    const next = jest.fn() as unknown as NextFunction;
    const req = buildReq({ body: { q: '<iframe src=x onerror=alert(1)>' } });

    threatDetection(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(req.securityThreats?.length).toBeGreaterThan(0);
  });

  it('does not stream telemetry for clean requests', () => {
    const next = jest.fn() as unknown as NextFunction;
    threatDetection(buildReq({ body: { name: 'Alice' } }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
