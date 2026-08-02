import { describe, it, expect, beforeEach, beforeAll, jest } from '@jest/globals';
import request from 'supertest';

interface VestingSchedule {
  id: string;
  workspaceId: string;
  projectId: string;
  tokenName: string;
  tokenSymbol: string;
  amount: number;
  cliffMonths: number;
  durationMonths: number;
  beneficiary: string;
  claimedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

let mockSchedules: VestingSchedule[] = [];

// Shared mock client methods
const mockVestingSchedule = {
  findUnique: jest.fn().mockImplementation(({ where }: any) => {
    const schedule = mockSchedules.find((s) => s.projectId === where.projectId);
    return Promise.resolve(schedule || null);
  }),
  findMany: jest.fn().mockImplementation(() => {
    return Promise.resolve(mockSchedules);
  }),
  create: jest.fn().mockImplementation(({ data }: any) => {
    const newSchedule: VestingSchedule = {
      id: `vest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workspaceId: data.workspaceId || 'default',
      projectId: data.projectId,
      tokenName: data.tokenName,
      tokenSymbol: data.tokenSymbol,
      amount: data.amount,
      cliffMonths: data.cliffMonths,
      durationMonths: data.durationMonths,
      beneficiary: data.beneficiary,
      claimedAmount: data.claimedAmount || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSchedules.push(newSchedule);
    return Promise.resolve(newSchedule);
  }),
  update: jest.fn().mockImplementation(({ where, data }: any) => {
    const scheduleIndex = mockSchedules.findIndex((s) => s.projectId === where.projectId);
    if (scheduleIndex === -1) {
      return Promise.reject(new Error('Record to update not found.'));
    }
    const schedule = mockSchedules[scheduleIndex];
    if (data.claimedAmount && data.claimedAmount.increment !== undefined) {
      schedule.claimedAmount += data.claimedAmount.increment;
    }
    schedule.updatedAt = new Date();
    mockSchedules[scheduleIndex] = schedule;
    return Promise.resolve(schedule);
  }),
};

// Mock @prisma/client globally
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => {
      return {
        vestingSchedule: mockVestingSchedule,
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

// Mock the db index file
jest.mock('../src/db/index.js', () => {
  return {
    __esModule: true,
    default: {
      vestingSchedule: mockVestingSchedule,
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
    },
    prisma: {
      vestingSchedule: mockVestingSchedule,
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
    },
  };
});

let app: any;

beforeAll(async () => {
  const module = await import('../src/index.js');
  app = module.app;
});

describe('Token Vesting API Integration Tests', () => {
  beforeEach(() => {
    mockSchedules = [];
  });

  describe('POST /api/v1/generator/vesting', () => {
    const validPayload = {
      projectId: 'proj-123',
      tokenName: 'Student Token',
      tokenSymbol: 'STU',
      amount: 100000,
      cliffMonths: 6,
      durationMonths: 24,
      beneficiary: 'GBSXA7IC23YOWSJHJNMVO4K66LZAMVLOUVM2ATCSJJRZ74UCE7IPJLAO',
    };

    it('creates and returns a new vesting schedule', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting')
        .send(validPayload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.projectId).toBe(validPayload.projectId);
      expect(response.body.tokenName).toBe(validPayload.tokenName);
      expect(response.body.tokenSymbol).toBe(validPayload.tokenSymbol);
      expect(response.body.amount).toBe(validPayload.amount);
      expect(response.body.cliffMonths).toBe(validPayload.cliffMonths);
      expect(response.body.durationMonths).toBe(validPayload.durationMonths);
      expect(response.body.beneficiary).toBe(validPayload.beneficiary);
      expect(response.body.claimedAmount).toBe(0);
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting')
        .send({
          projectId: 'proj-123',
          tokenName: 'Student Token',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('returns 400 when validation rules fail', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting')
        .send({
          ...validPayload,
          beneficiary: 'invalid-stellar-key',
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid Stellar public key format');
    });

    it('returns 400 if vesting schedule already exists for project', async () => {
      await request(app).post('/api/v1/generator/vesting').send(validPayload).expect(201);

      const response = await request(app)
        .post('/api/v1/generator/vesting')
        .send(validPayload)
        .expect(400);

      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /api/v1/generator/vesting', () => {
    it('returns a list of vesting schedules', async () => {
      mockSchedules = [
        {
          id: 'vest-1',
          workspaceId: 'default',
          projectId: 'proj-1',
          tokenName: 'Token 1',
          tokenSymbol: 'TK1',
          amount: 50000,
          cliffMonths: 3,
          durationMonths: 12,
          beneficiary: 'GBSXA7IC23YOWSJHJNMVO4K66LZAMVLOUVM2ATCSJJRZ74UCE7IPJLAO',
          claimedAmount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'vest-2',
          workspaceId: 'default',
          projectId: 'proj-2',
          tokenName: 'Token 2',
          tokenSymbol: 'TK2',
          amount: 100000,
          cliffMonths: 6,
          durationMonths: 24,
          beneficiary: 'GBSXA7IC23YOWSJHJNMVO4K66LZAMVLOUVM2ATCSJJRZ74UCE7IPJLAO',
          claimedAmount: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const response = await request(app).get('/api/v1/generator/vesting').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].projectId).toBe('proj-1');
      expect(response.body[1].projectId).toBe('proj-2');
    });
  });

  describe('GET /api/v1/generator/vesting/:projectId', () => {
    it('returns a single vesting schedule if found', async () => {
      const schedule = {
        id: 'vest-1',
        workspaceId: 'default',
        projectId: 'proj-1',
        tokenName: 'Token 1',
        tokenSymbol: 'TK1',
        amount: 50000,
        cliffMonths: 3,
        durationMonths: 12,
        beneficiary: 'GBSXA7IC23YOWSJHJNMVO4K66LZAMVLOUVM2ATCSJJRZ74UCE7IPJLAO',
        claimedAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockSchedules = [schedule];

      const response = await request(app).get('/api/v1/generator/vesting/proj-1').expect(200);

      expect(response.body.projectId).toBe('proj-1');
      expect(response.body.tokenName).toBe('Token 1');
    });

    it('returns 404 if schedule not found', async () => {
      await request(app).get('/api/v1/generator/vesting/non-existent').expect(404);
    });
  });

  describe('POST /api/v1/generator/vesting/:projectId/claim', () => {
    beforeEach(() => {
      mockSchedules = [
        {
          id: 'vest-claim-1',
          workspaceId: 'default',
          projectId: 'proj-claim',
          tokenName: 'Reward Token',
          tokenSymbol: 'RWD',
          amount: 120000,
          cliffMonths: 6,
          durationMonths: 12,
          beneficiary: 'GBSXA7IC23YOWSJHJNMVO4K66LZAMVLOUVM2ATCSJJRZ74UCE7IPJLAO',
          claimedAmount: 10000,
          createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Created 1 year ago (fully vested)
          updatedAt: new Date(),
        },
      ];
    });

    it('processes a claim successfully when amount is within claimable limits (real-time)', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting/proj-claim/claim')
        .send({ amount: 50000 })
        .expect(200);

      expect(response.body.claimedAmount).toBe(60000);
    });

    it('rejects a claim when amount exceeds claimable limits (real-time)', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting/proj-claim/claim')
        .send({ amount: 115000 })
        .expect(400);

      expect(response.body.error).toContain('exceeds claimable amount');
    });

    it('processes simulated time claims successfully', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting/proj-claim/claim')
        .send({
          amount: 40000,
          simulatedMonthsElapsed: 8,
        })
        .expect(200);

      expect(response.body.claimedAmount).toBe(50000);
    });

    it('rejects simulated claim before cliff period is reached', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting/proj-claim/claim')
        .send({
          amount: 5000,
          simulatedMonthsElapsed: 4,
        })
        .expect(400);

      expect(response.body.error).toContain('exceeds claimable amount');
    });

    it('rejects claim amount equal to 0 or negative', async () => {
      const response = await request(app)
        .post('/api/v1/generator/vesting/proj-claim/claim')
        .send({ amount: -500 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});
