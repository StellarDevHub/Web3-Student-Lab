import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const redisStore = new Map<string, string>();
const calls: Array<{ fn: string; args: unknown[] }> = [];

const mockRedis = {
  get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
  del: vi.fn(async (k: string) => {
    redisStore.delete(k);
    return 1;
  }),
  // SET key value EX ttl NX
  set: vi.fn(async (k: string, v: string, mode1: string, ttl: number, mode2: string) => {
    if (redisStore.has(k)) return null;
    redisStore.set(k, v);
    return 'OK';
  }),
  setex: vi.fn(async (k: string, ttl: number, v: string) => {
    redisStore.set(k, v);
    return 'OK';
  }),
};

vi.mock('../utils/redis.js', () => ({
  __esModule: true,
  default: mockRedis,
}));

function makeReq(header?: string): Request {
  const req = {} as Request;
  req.headers = header ? { 'idempotency-key': header } : {};
  return req;
}

function makeRes(): Response & { _body: unknown; _status: number } {
  const res = {} as Response & { _body: unknown; _status: number };
  res.statusCode = 200;
  res._status = 200;
  res.getHeader = vi.fn((h: string) => (h === 'content-type' ? 'application/json' : undefined));
  res.setHeader = vi.fn();
  res.json = vi.fn((body: unknown) => {
    res._body = body;
    return res as any;
  });
  res.send = vi.fn((body: unknown) => {
    res._body = body;
    return res as any;
  });
  res.status = vi.fn((code: number) => {
    res._status = code;
    res.statusCode = code;
    return res as any;
  });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
  calls.length = 0;
  void calls;
});

describe('idempotency middleware (issue #1126)', () => {
  it('passes through requests without an Idempotency-Key header', async () => {
    const { idempotency } = await import('./idempotency.js');
    const next = vi.fn();
    await idempotency()(makeReq(undefined), makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it('caches the first response and replays it for an identical key', async () => {
    const { idempotency } = await import('./idempotency.js');
    const next = vi.fn(() => {
      const res = lastRes;
      res.status(201).json({ ok: true });
    });

    const lastRes = makeRes();
    // First execution stores the response.
    await idempotency()(makeReq('key-0001'), lastRes, next as NextFunction);
    // Wait for the async capture to run.
    await new Promise((r) => setTimeout(r, 10));
    expect(mockRedis.setex).toHaveBeenCalled();

    // Second execution with the same key should replay the cached body and set the replay header.
    const res2 = makeRes();
    const next2 = vi.fn();
    await idempotency()(makeReq('key-0001'), res2, next2 as NextFunction);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(201);
    // The cached payload is replayed byte-for-byte (string body) so the
    // response is binary-safe and identical to the original.
    expect(res2._body).toBe(JSON.stringify({ ok: true }));
    expect(res2.setHeader).toHaveBeenCalledWith('X-Idempotency-Replay', 'true');
  });

  it('returns 409 while a concurrent request with the same key holds the lock', async () => {
    const { idempotency } = await import('./idempotency.js');
    const next = vi.fn();
    const res = makeRes();

    // Simulate the lock already held by an in-flight request (SET NX returns null).
    redisStore.set('idempotency:lock:global:key-0002', '1');
    await idempotency()(makeReq('key-0002'), res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
  });

  it('releases the in-flight lock after the response is sent', async () => {
    const { idempotency } = await import('./idempotency.js');
    const next = vi.fn(() => {
      lastRes.status(200).json({ done: true });
    });
    const lastRes = makeRes();

    await idempotency()(makeReq('key-0003'), lastRes, next as NextFunction);
    await new Promise((r) => setTimeout(r, 10));

    // Lock key should be deleted after completion.
    const lockKey = [...redisStore.keys()].find((k) => k.includes(':lock:'));
    expect(lockKey).toBeUndefined();
  });

  it('rejects malformed oversized Idempotency-Key values with 400', async () => {
    const { idempotency } = await import('./idempotency.js');
    const next = vi.fn();
    const res = makeRes();

    await idempotency()(makeReq('x'.repeat(300)), res, next as NextFunction);

    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });
});