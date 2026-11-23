import {
  clearDbRoutingStateForTests,
  getDatabaseRoleForOperation,
  markUserWriteToPrimary,
  runWithDbRoutingContext,
  setDbRoutingUserId,
} from '../src/db/requestContext.js';

describe('DB routing context', () => {
  const originalLagWindow = process.env.DB_REPLICATION_LAG_WINDOW_MS;

  beforeEach(() => {
    process.env.DB_REPLICATION_LAG_WINDOW_MS = '1000';
    clearDbRoutingStateForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    clearDbRoutingStateForTests();
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env.DB_REPLICATION_LAG_WINDOW_MS = originalLagWindow;
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

  it('keeps reads on primary for non-GET requests', () => {
    runWithDbRoutingContext('POST', () => {
      expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');
    });
  });

  it('forces primary reads immediately after a user write and releases after lag window', () => {
    runWithDbRoutingContext('GET', () => {
      setDbRoutingUserId('student-1');
      markUserWriteToPrimary('student-1');

      expect(getDatabaseRoleForOperation('findUnique')).toBe('primary');

      jest.advanceTimersByTime(1001);

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

      jest.advanceTimersByTime(1001);

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
});
