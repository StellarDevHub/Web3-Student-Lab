/**
 * Route tests for the admin DLQ inspector (#1422 / BE-HARD-31):
 * authentication, authorization, validation and handler wiring.
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
    (req as any).user = {
      id: 'admin-user-id',
      email: 'admin@web3studentlab.org',
      role: mockAuthRole,
    };
    next();
  },
}));

const mockInspectDLQ = jest.fn();
const mockGetDLQJob = jest.fn();
const mockGetDLQMetrics = jest.fn();
const mockGetDLQTriageSummary = jest.fn();
const mockReplayDLQJob = jest.fn();
const mockReplayAllDLQJobs = jest.fn();
const mockReplayDLQJobsByIds = jest.fn();
const mockPurgeDLQ = jest.fn();
const mockPurgeDLQJobsByIds = jest.fn();

jest.mock('../src/services/dlq.service.js', () => ({
  inspectDLQ: (...args: unknown[]) => mockInspectDLQ(...args),
  getDLQJob: (...args: unknown[]) => mockGetDLQJob(...args),
  getDLQMetrics: (...args: unknown[]) => mockGetDLQMetrics(...args),
  getDLQTriageSummary: (...args: unknown[]) => mockGetDLQTriageSummary(...args),
  replayDLQJob: (...args: unknown[]) => mockReplayDLQJob(...args),
  replayAllDLQJobs: (...args: unknown[]) => mockReplayAllDLQJobs(...args),
  replayDLQJobsByIds: (...args: unknown[]) => mockReplayDLQJobsByIds(...args),
  purgeDLQ: (...args: unknown[]) => mockPurgeDLQ(...args),
  purgeDLQJobsByIds: (...args: unknown[]) => mockPurgeDLQJobsByIds(...args),
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import express from 'express';
import request from 'supertest';

let app: express.Application;

beforeAll(async () => {
  const { default: adminDlqRouter } = await import('../src/routes/admin/dlq.routes.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/admin/dlq', adminDlqRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthRole = 'admin';
});

describe('Admin DLQ Routes (/api/v1/admin/dlq)', () => {
  describe('Authorization & Authentication', () => {
    it('returns 401 when unauthenticated', async () => {
      mockAuthRole = 'unauthenticated';
      const res = await request(app).get('/api/v1/admin/dlq/metrics');
      expect(res.status).toBe(401);
      expect(mockGetDLQMetrics).not.toHaveBeenCalled();
    });

    it('returns 403 for a non-admin user', async () => {
      mockAuthRole = 'student';
      const res = await request(app).get('/api/v1/admin/dlq/metrics');
      expect(res.status).toBe(403);
      expect(mockGetDLQMetrics).not.toHaveBeenCalled();
    });
  });

  describe('GET /metrics', () => {
    it('returns DLQ metrics for an admin', async () => {
      mockGetDLQMetrics.mockResolvedValue({
        totalCount: 2,
        perQueue: { 'webhook-delivery-queue': 2 },
        isAlerting: false,
        threshold: 10,
      });

      const res = await request(app).get('/api/v1/admin/dlq/metrics');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.metrics.totalCount).toBe(2);
    });
  });

  describe('GET /jobs/:dlqId', () => {
    it('returns 404 when the record is missing', async () => {
      mockGetDLQJob.mockResolvedValue(undefined);
      const res = await request(app).get('/api/v1/admin/dlq/jobs/missing');
      expect(res.status).toBe(404);
    });

    it('returns the record with its triage classification', async () => {
      mockGetDLQJob.mockResolvedValue({
        dlqId: 'dlq_1',
        triage: { category: 'timeout', action: 'replay', retryable: true },
      });
      const res = await request(app).get('/api/v1/admin/dlq/jobs/dlq_1');
      expect(res.status).toBe(200);
      expect(res.body.data.job.dlqId).toBe('dlq_1');
      expect(res.body.data.job.triage.category).toBe('timeout');
    });
  });

  describe('POST /jobs/:dlqId/replay', () => {
    it('returns 400 when replay fails', async () => {
      mockReplayDLQJob.mockResolvedValue({ success: false, error: 'not found' });
      const res = await request(app).post('/api/v1/admin/dlq/jobs/dlq_1/replay');
      expect(res.status).toBe(400);
    });

    it('returns the replayed job id on success', async () => {
      mockReplayDLQJob.mockResolvedValue({ success: true, replayedJobId: 'job_42' });
      const res = await request(app).post('/api/v1/admin/dlq/jobs/dlq_1/replay');
      expect(res.status).toBe(200);
      expect(res.body.data.replayedJobId).toBe('job_42');
    });
  });

  describe('POST /replay', () => {
    it('rejects an invalid body', async () => {
      const res = await request(app)
        .post('/api/v1/admin/dlq/replay')
        .send({ queueName: 123 });
      expect(res.status).toBe(400);
      expect(mockReplayAllDLQJobs).not.toHaveBeenCalled();
    });

    it('replays all queues when no queueName is supplied', async () => {
      mockReplayAllDLQJobs.mockResolvedValue({ replayedCount: 3, errors: [] });
      const res = await request(app).post('/api/v1/admin/dlq/replay').send({});
      expect(res.status).toBe(200);
      expect(mockReplayAllDLQJobs).toHaveBeenCalledWith(undefined);
      expect(res.body.data.replayedCount).toBe(3);
    });
  });

  describe('DELETE /purge', () => {
    it('rejects a purge without confirmation', async () => {
      const res = await request(app).delete('/api/v1/admin/dlq/purge').send({});
      expect(res.status).toBe(400);
      expect(mockPurgeDLQ).not.toHaveBeenCalled();
    });

    it('purges when confirmed', async () => {
      mockPurgeDLQ.mockResolvedValue({ purgedCount: 2 });
      const res = await request(app)
        .delete('/api/v1/admin/dlq/purge')
        .send({ confirm: true });
      expect(res.status).toBe(200);
      expect(mockPurgeDLQ).toHaveBeenCalledWith(undefined);
    });
  });

  describe('POST /batch-retry', () => {
    it('rejects an empty batch', async () => {
      const res = await request(app).post('/api/v1/admin/dlq/batch-retry').send({ dlqIds: [] });
      expect(res.status).toBe(400);
      expect(mockReplayDLQJobsByIds).not.toHaveBeenCalled();
    });

    it('replays the selected DLQ ids', async () => {
      mockReplayDLQJobsByIds.mockResolvedValue({ replayedCount: 2, errors: [] });
      const res = await request(app)
        .post('/api/v1/admin/dlq/batch-retry')
        .send({ dlqIds: ['dlq_1', 'dlq_2'] });

      expect(res.status).toBe(200);
      expect(mockReplayDLQJobsByIds).toHaveBeenCalledWith(['dlq_1', 'dlq_2']);
      expect(res.body.data.replayedCount).toBe(2);
    });
  });

  describe('DELETE /batch-purge', () => {
    it('rejects a batch purge without confirmation', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/dlq/batch-purge')
        .send({ dlqIds: ['dlq_1'] });
      expect(res.status).toBe(400);
      expect(mockPurgeDLQJobsByIds).not.toHaveBeenCalled();
    });

    it('purges the selected DLQ ids when confirmed', async () => {
      mockPurgeDLQJobsByIds.mockResolvedValue({ purgedCount: 1, missingIds: ['missing'] });
      const res = await request(app)
        .delete('/api/v1/admin/dlq/batch-purge')
        .send({ dlqIds: ['dlq_1', 'missing'], confirm: true });

      expect(res.status).toBe(200);
      expect(mockPurgeDLQJobsByIds).toHaveBeenCalledWith(['dlq_1', 'missing']);
      expect(res.body.data.purgedCount).toBe(1);
      expect(res.body.data.missingIds).toEqual(['missing']);
    });
  });

  describe('GET /triage', () => {
    it('returns the automated triage summary', async () => {
      mockGetDLQTriageSummary.mockResolvedValue({
        total: 1,
        byCategory: { timeout: 1 },
        byAction: { replay: 1 },
        replayableIds: ['dlq_1'],
      });

      const res = await request(app).get('/api/v1/admin/dlq/triage');
      expect(res.status).toBe(200);
      expect(res.body.data.triage.total).toBe(1);
      expect(res.body.data.triage.replayableIds).toEqual(['dlq_1']);
    });
  });
});
