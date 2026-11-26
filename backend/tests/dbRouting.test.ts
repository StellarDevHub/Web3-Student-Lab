import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import {
  clearDbRoutingStateForTests,
  DEFAULT_SESSION_PIN_WINDOW_MS,
  getDatabaseRoleForOperation,
  getPreferredReplicaRegion,
  markUserWriteToPrimary,
  runWithDbRoutingContext,
  setDbRoutingUserId,
} from '../src/db/requestContext.js';
import { dbRoutingMiddleware } from '../src/middleware/dbRouting.js';

const createMockReqRes = (
  method: string,
  headers: Record<string, string> = {},
  userId?: string
) => {
  const req = {
    method,
    headers,
    ...(userId ? { user: { id: userId } } : {}),
  } as unknown as Request & { user?: { id?: string } };

  const resEmitter = new EventEmitter();
  const res = Object.assign(resEmitter, {
    statusCode: 200,
  }) as unknown as Response & EventEmitter;

  return { req, res };
};

describe('DB routing context', () => {
  const originalLagWindow = process.env.DB_REPLICATION_LAG_WINDOW_MS;

  beforeEach(() => {
    delete process.env.DB_REPLICATION_LAG_WINDOW_MS;
    clearDbRoutingStateForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    clearDbRoutingStateForTests();
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalLagWindow === undefined) {
      delete process.env.DB_REPLICATION_LAG_WINDOW_MS;
    } else {
      process.env.DB_REPLICATION_LAG_WINDOW_MS = originalLagWindow;
    }
  });

  it('uses read role for GET read operations', () => {
    runWithDbRoutingContext('GET', () => {
      expect(getDatabaseRoleForOperation('findMany')).toBe('read');
    });
  });

  it('keeps write operations on primary even during GET requests', () => {
    runWithDbRoutingContext('GET', () => {
      expect(getDatabaseRoleForOperation('update')).toBe('primary');
    });
  });

  it('keeps reads on primary for POST, PUT, PATCH, and DELETE requests', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      runWithDbRoutingContext(method, () => {
        expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');
      });
    }
  });

  it('pins mutating users to primary for 3 seconds by default and releases afterwards', () => {
    expect(DEFAULT_SESSION_PIN_WINDOW_MS).toBe(3000);

    runWithDbRoutingContext('GET', () => {
      setDbRoutingUserId('student-1');
      markUserWriteToPrimary('student-1');

      expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');

      jest.advanceTimersByTime(2999);
      expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');

      jest.advanceTimersByTime(2);
      expect(getDatabaseRoleForOperation('findUnique')).toBe('read');
    });
  });

  it('defaults to primary outside request context', () => {
    expect(getDatabaseRoleForOperation('findMany')).toBe('primary');
  });

  it('isolates lag window per user', () => {
    runWithDbRoutingContext('GET', () => {
      setDbRoutingUserId('student-1');
      markUserWriteToPrimary('student-1');

      expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');

      setDbRoutingUserId('student-2');
      expect(getDatabaseRoleForOperation('findUnique')).toBe('read');

      jest.advanceTimersByTime(3001);

      setDbRoutingUserId('student-1');
      expect(getDatabaseRoleForOperation('findUnique')).toBe('read');
    });
  });

  it('respects a custom lag window from environment', () => {
    process.env.DB_REPLICATION_LAG_WINDOW_MS = '2000';
    runWithDbRoutingContext('GET', () => {
      setDbRoutingUserId('student-1');
      markUserWriteToPrimary('student-1');

      expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');

      jest.advanceTimersByTime(1500);

      expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');

      jest.advanceTimersByTime(600);

      expect(getDatabaseRoleForOperation('findUnique')).toBe('read');
    });
  });

  it('pins session to primary for 3s after a POST request via dbRoutingMiddleware', () => {
    const postCtx = createMockReqRes('POST', { 'x-session-id': 'sess-abc' });
    dbRoutingMiddleware(postCtx.req, postCtx.res, () => {
      expect(getDatabaseRoleForOperation('create')).toBe('primary');
      setDbRoutingUserId('student-99');
      postCtx.res.emit('finish');
    });

    // Immediate subsequent GET with same session should hit primary
    const getCtx1 = createMockReqRes('GET', { 'x-session-id': 'sess-abc' });
    dbRoutingMiddleware(getCtx1.req, getCtx1.res, () => {
      expect(getDatabaseRoleForOperation('findMany')).toBe('primary');
    });

    // Another session should still route GETs to read replica
    const otherGetCtx = createMockReqRes('GET', { 'x-session-id': 'sess-other' });
    dbRoutingMiddleware(otherGetCtx.req, otherGetCtx.res, () => {
      expect(getDatabaseRoleForOperation('findMany')).toBe('read');
    });

    // After 3 seconds, the pinned session returns to read replica
    jest.advanceTimersByTime(3001);
    const getCtx2 = createMockReqRes('GET', { 'x-session-id': 'sess-abc' });
    dbRoutingMiddleware(getCtx2.req, getCtx2.res, () => {
      expect(getDatabaseRoleForOperation('findMany')).toBe('read');
    });
  });

  it('propagates preferred region header into routing context', () => {
    const { req, res } = createMockReqRes('GET', { 'x-db-region': 'EU-WEST' });
    dbRoutingMiddleware(req, res, () => {
      expect(getPreferredReplicaRegion()).toBe('eu-west');
      expect(getDatabaseRoleForOperation('findMany')).toBe('read');
    });
  });
});
