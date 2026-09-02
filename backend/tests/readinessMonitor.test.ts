import redisClient from '../src/cache/RedisClient.js';
import prisma from '../src/db/index.js';
import { checkReadiness } from '../src/db/readinessMonitor.js';

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../src/cache/RedisClient.js', () => ({
  __esModule: true,
  default: {
    getClient: jest.fn(),
  },
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLogger: { info: jest.fn() },
}));

const mockedPrisma = prisma as unknown as { $queryRaw: jest.Mock };
const mockedGetClient = redisClient.getClient as jest.Mock;

describe('Readiness Monitor', () => {
  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.HEALTH_READINESS_TIMEOUT_MS;
  });

  it('returns ready when database and redis are healthy', async () => {
    mockedPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockedGetClient.mockReturnValue({ ping: jest.fn().mockResolvedValue('PONG') });

    const result = await checkReadiness();

    expect(result.status).toBe('ready');
    expect(result.checks.database.status).toBe('ready');
    expect(result.checks.redis.status).toBe('ready');
  });

  it('returns not_ready when database is unavailable', async () => {
    mockedPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    mockedGetClient.mockReturnValue({ ping: jest.fn().mockResolvedValue('PONG') });

    const result = await checkReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('unavailable');
    expect(result.checks.database.error).toBe('database unavailable');
    expect(result.checks.redis.status).toBe('ready');
  });

  it('returns not_ready when redis is unavailable', async () => {
    mockedPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockedGetClient.mockReturnValue({
      ping: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379')),
    });

    const result = await checkReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('ready');
    expect(result.checks.redis.status).toBe('unavailable');
    expect(result.checks.redis.error).toBe('redis unavailable');
  });

  it('returns not_ready when redis client is not connected', async () => {
    mockedPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockedGetClient.mockReturnValue(null);

    const result = await checkReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.redis.status).toBe('unavailable');
  });

  it('times out slow dependency checks', async () => {
    process.env.HEALTH_READINESS_TIMEOUT_MS = '10';
    mockedPrisma.$queryRaw.mockReturnValueOnce(new Promise(() => {}));
    mockedGetClient.mockReturnValue({ ping: jest.fn().mockResolvedValue('PONG') });

    const result = await checkReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('unavailable');
    expect(result.checks.database.error).toBe('database unavailable');
    expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(10);
  });

  it('sanitizes errors and never leaks credentials or connection details', async () => {
    mockedPrisma.$queryRaw.mockRejectedValueOnce(
      new Error('postgres://user:secret@db:5432/web3-student-lab FAILED')
    );
    mockedGetClient.mockReturnValue({
      ping: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379')),
    });

    const result = await checkReadiness();

    expect(result.checks.database.error).toBe('database unavailable');
    expect(result.checks.database.error).not.toContain('postgres://');
    expect(result.checks.redis.error).toBe('redis unavailable');
    expect(result.checks.redis.error).not.toContain('127.0.0.1');
  });
});
