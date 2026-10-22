/**
 * Route tests for the BullMQ admin control plane (BE-006): auth, validation
 * and inspect / replay / purge of dead-lettered jobs.
 */
import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

type AuthRole = 'unauthenticated' | 'student' | 'admin';
let mockAuthRole: AuthRole = 'admin';

jest.mock('../src/middleware/auth.js', () => ({
  authenticateToken: (req: Request, res: Response, next: NextFunction) => {
    if (mockAuthRole === 'unauthenticated') {
      return res.status(401).json({ status: 'error', message: 'Access token required' });
    }
    (req as any).user = { id: 'admin-user-id', email: 'admin@web3studentlab.org', role: mockAuthRole };
    next();
  },
}));

const mockDlq = {
  list: jest.fn(),
  get: jest.fn(),
  replay: jest.fn(),
  replayAll: jest.fn(),
  purge: jest.fn(),
  purgeAll: jest.fn(),
};
const mockGetStats = jest.fn();

jest.mock('../src/queues/queueManager.js', () => ({
  getQueueManager: () => ({ dlq: mockDlq, getStats: mockGetStats }),
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import request from 'supertest';

let app: express.Application;

beforeAll(async () => {
  const { default: router } = await import('../src/routes/admin/queues.routes.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/admin/queues', router);
});

beforeEach(() => {
  mockAuthRole = 'admin';
  jest.clearAllMocks();
});

describe('admin queue routes', () => {
  it('requires authentication', async () => {
    mockAuthRole = 'unauthenticated';
    const res = await request(app).get('/api/v1/admin/queues/dlq');
    expect(res.status).toBe(401);
  });

  it('requires the admin role', async () => {
    mockAuthRole = 'student';
    const res = await request(app).get('/api/v1/admin/queues/dlq');
    expect(res.status).toBe(403);
    expect(mockDlq.list).not.toHaveBeenCalled();
  });

  it('returns queue statistics', async () => {
    mockGetStats.mockResolvedValue([{ queue: 'tx-minting', tier: 'critical', counts: { waiting: 1 } }] as never);
    const res = await request(app).get('/api/v1/admin/queues/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.queues[0].queue).toBe('tx-minting');
  });

  it('lists dead-lettered jobs with filter and pagination', async () => {
    mockDlq.list.mockResolvedValue({ total: 1, entries: [{ id: 'ipfs-pinning--1' }] } as never);
    const res = await request(app).get('/api/v1/admin/queues/dlq?queue=ipfs-pinning&limit=10&offset=5');
    expect(res.status).toBe(200);
    expect(mockDlq.list).toHaveBeenCalledWith({ sourceQueue: 'ipfs-pinning', limit: 10, offset: 5 });
    expect(res.body.data).toMatchObject({ total: 1, count: 1 });
  });

  it('inspects a single job and 404s for unknown ids', async () => {
    mockDlq.get.mockResolvedValueOnce({ id: 'x', failedReason: 'boom' } as never).mockResolvedValueOnce(null as never);
    expect((await request(app).get('/api/v1/admin/queues/dlq/x')).body.data.entry.failedReason).toBe('boom');
    expect((await request(app).get('/api/v1/admin/queues/dlq/y')).status).toBe(404);
  });

  it('replays one job', async () => {
    mockDlq.replay.mockResolvedValue({ id: 'x', replayedJobId: '42', sourceQueue: 'tx-minting' } as never);
    const res = await request(app).post('/api/v1/admin/queues/dlq/x/replay');
    expect(res.status).toBe(200);
    expect(res.body.data.replayedJobId).toBe('42');
  });

  it('replays in bulk, optionally per queue', async () => {
    mockDlq.replayAll.mockResolvedValue({ replayed: 3, failed: [] } as never);
    const res = await request(app).post('/api/v1/admin/queues/dlq/replay').send({ queueName: 'tx-minting' });
    expect(res.status).toBe(200);
    expect(mockDlq.replayAll).toHaveBeenCalledWith('tx-minting');
  });

  it('refuses to purge without explicit confirmation', async () => {
    const res = await request(app).post('/api/v1/admin/queues/dlq/purge').send({});
    expect(res.status).toBe(400);
    expect(mockDlq.purgeAll).not.toHaveBeenCalled();
  });

  it('purges all dead-lettered jobs when confirmed', async () => {
    mockDlq.purgeAll.mockResolvedValue({ purged: 4 } as never);
    const res = await request(app).post('/api/v1/admin/queues/dlq/purge').send({ confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ purged: 4, queueName: 'all' });
  });

  it('purges a single job', async () => {
    mockDlq.purge.mockResolvedValueOnce(true as never).mockResolvedValueOnce(false as never);
    expect((await request(app).delete('/api/v1/admin/queues/dlq/x')).status).toBe(200);
    expect((await request(app).delete('/api/v1/admin/queues/dlq/x')).status).toBe(404);
  });
});
