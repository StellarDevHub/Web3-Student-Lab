import { EventEmitter } from 'node:events';

type RedisEntry = { value: string; expiresAt: number };
const mockStore = new Map<string, RedisEntry>();
const mockRedis = {
  get: jest.fn(async (key: string) => {
    const entry = mockStore.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      mockStore.delete(key);
      return null;
    }
    return entry.value;
  }),
  set: jest.fn(async (key: string, value: string, _ex: string, seconds: number, _nx: string) => {
    const existing = await mockRedis.get(key);
    if (existing !== null) return null;
    mockStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }),
  setex: jest.fn(async (key: string, seconds: number, value: string) => {
    mockStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }),
  eval: jest.fn(async (_script: string, _keys: number, key: string, owner: string) => {
    const entry = mockStore.get(key);
    if (entry?.value !== owner) return 0;
    mockStore.delete(key);
    return 1;
  }),
};

jest.mock('../src/utils/redis.js', () => ({ __esModule: true, default: mockRedis }));
jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// Load after the Redis mock is initialized so the middleware uses the isolated store.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { idempotency } = require('../src/middleware/idempotency.js') as typeof import('../src/middleware/idempotency.js');

function makeRequest(key: string, body: unknown = { amount: 10 }): any {
  return {
    headers: { 'idempotency-key': key },
    method: 'POST',
    baseUrl: '/api/subscriptions',
    path: '/pay',
    body,
    user: { id: 'user-1' },
  };
}

function makeResponse(): any {
  const response = new EventEmitter() as any;
  const headers = new Map<string, string>();
  response.statusCode = 200;
  response.status = jest.fn((status: number) => {
    response.statusCode = status;
    return response;
  });
  response.setHeader = jest.fn((name: string, value: string) => headers.set(name, value));
  response.getHeader = jest.fn((name: string) => headers.get(name));
  response.json = jest.fn((body: unknown) => {
    response.body = body;
    response.emit('finish');
    return response;
  });
  response.send = jest.fn((body: unknown) => {
    response.body = body;
    response.emit('finish');
    return response;
  });
  return response;
}

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('Redis-backed idempotency middleware', () => {
  it('replays the original successful response for a duplicate key', async () => {
    const middleware = idempotency();
    const firstResponse = makeResponse();
    const next = jest.fn(() => firstResponse.status(201).json({ paymentId: 'pay-1' }));

    await middleware(makeRequest('key-1'), firstResponse, next);
    await new Promise((resolve) => setImmediate(resolve));

    const replayResponse = makeResponse();
    const replayNext = jest.fn();
    await middleware(makeRequest('key-1'), replayResponse, replayNext);

    expect(next).toHaveBeenCalledTimes(1);
    expect(replayNext).not.toHaveBeenCalled();
    expect(replayResponse.statusCode).toBe(201);
    expect(replayResponse.body).toBe(JSON.stringify({ paymentId: 'pay-1' }));
    expect(replayResponse.setHeader).toHaveBeenCalledWith('X-Idempotency-Replay', 'true');
    expect(mockRedis.setex).toHaveBeenCalledWith(expect.any(String), 86_400, expect.any(String));
  });

  it('rejects a concurrent duplicate while the first request is in progress', async () => {
    const middleware = idempotency();
    const firstResponse = makeResponse();
    const firstNext = jest.fn();

    await middleware(makeRequest('key-2'), firstResponse, firstNext);

    const secondResponse = makeResponse();
    const secondNext = jest.fn();
    await middleware(makeRequest('key-2'), secondResponse, secondNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).not.toHaveBeenCalled();
    expect(secondResponse.statusCode).toBe(409);
  });

  it('allows a retry after a failed response and does not cache the failure', async () => {
    const middleware = idempotency();
    const failedResponse = makeResponse();
    const failedNext = jest.fn(() => failedResponse.status(500).json({ error: 'temporary' }));

    await middleware(makeRequest('key-3'), failedResponse, failedNext);
    await new Promise((resolve) => setImmediate(resolve));

    const retryResponse = makeResponse();
    const retryNext = jest.fn(() => retryResponse.status(201).json({ ok: true }));
    await middleware(makeRequest('key-3'), retryResponse, retryNext);

    expect(retryNext).toHaveBeenCalledTimes(1);
    expect(mockRedis.setex).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a key for a different request body', async () => {
    const middleware = idempotency();
    const firstResponse = makeResponse();
    await middleware(
      makeRequest('key-4', { amount: 10 }),
      firstResponse,
      jest.fn(() => firstResponse.json({ ok: true }))
    );
    await new Promise((resolve) => setImmediate(resolve));

    const conflictResponse = makeResponse();
    const conflictNext = jest.fn();
    await middleware(makeRequest('key-4', { amount: 20 }), conflictResponse, conflictNext);

    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictNext).not.toHaveBeenCalled();
  });

  it('fails closed when Redis is unavailable', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('redis unavailable'));
    const response = makeResponse();
    const next = jest.fn();

    await idempotency()(makeRequest('key-5'), response, next);

    expect(response.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});
