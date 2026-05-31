import { checkDbHealth } from '../src/db/healthMonitor.js';
import prisma from '../src/db/index.js';

type PrismaMock = {
  $queryRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
};

jest.mock('../src/db/index.js', () => ({
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
}));

const mockedPrisma = prisma as unknown as PrismaMock;

describe('DB Health Monitor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.DB_POOL_MAX = '10';
  });

  it('returns healthy when latency is low and pool utilization stays under threshold', async () => {
    mockedPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockedPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ active: '3' }]);

    const health = await checkDbHealth();

    expect(health.status).toBe('healthy');
    expect(health.poolUsage.active).toBe(3);
    expect(health.poolUsage.total).toBe(10);
    expect(health.poolUsage.utilizationPct).toBe(30);
    expect(health.alerts).toHaveLength(0);
  });

  it('returns a warning when utilization exceeds configured pool threshold', async () => {
    mockedPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockedPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ active: '9' }]);

    const health = await checkDbHealth();

    expect(health.status).toBe('healthy');
    expect(health.poolUsage.active).toBe(9);
    expect(health.poolUsage.utilizationPct).toBe(90);
    expect(health.alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DB connection utilization is 90%'),
      ])
    );
  });

  it('returns unhealthy when the database connection check fails', async () => {
    mockedPrisma.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));

    const health = await checkDbHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.alerts[0]).toContain('DB connection failed');
  });
});
