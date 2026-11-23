import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { NextFunction, Request, Response } from 'express';
import { workspaceModels } from '../src/db/workspaceModels.js';
import { validateWorkspaceMembership } from '../src/middleware/workspaceMembership.js';
import { workspaceContextStorage } from '../src/middleware/WorkspaceContext.js';

// Mock the DB module so the middleware can be tested without a database.
const mockStudentFindUnique = jest.fn();
const mockEnrollmentFindFirst = jest.fn();
const mockLogAudit = jest.fn();

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    student: { findUnique: (...args: unknown[]) => mockStudentFindUnique(...args) },
    enrollment: { findFirst: (...args: unknown[]) => mockEnrollmentFindFirst(...args) },
  },
}));

jest.mock('../src/utils/audit.js', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

const makeReq = (overrides: Partial<Request> = {}): Request =>
  ({
    path: '/api/v1/courses',
    method: 'GET',
    ip: '127.0.0.1',
    get: jest.fn(() => 'jest'),
    ...overrides,
  }) as unknown as Request;

const makeRes = (): Response & { statusCode: number; body: unknown } => {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  } as unknown as Response & { statusCode: number; body: unknown };
  return res;
};

const runMiddleware = async (req: Request, res: Response): Promise<void> => {
  await validateWorkspaceMembership(req, res, (() => undefined) as NextFunction);
};

describe('Workspace RLS (#1119)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspaceContextStorage.disable();
  });

  describe('workspaceModels coverage', () => {
    it('includes every Prisma model that carries a workspaceId column', () => {
      for (const model of [
        'Student',
        'Course',
        'Certificate',
        'CertificateVerificationEvent',
        'ContributorProof',
        'DecentralizedAsset',
        'Enrollment',
        'Feedback',
        'Idea',
        'LearningProgress',
        'AuditLog',
        'Canvas',
        'NotificationPreferences',
        'P2PNode',
        'WebhookSubscription',
        'TranslationEntry',
        'VestingSchedule',
      ]) {
        expect(workspaceModels.has(model)).toBe(true);
      }
    });
  });

  describe('validateWorkspaceMembership', () => {
    it('passes through when no workspace context is active', async () => {
      const req = makeReq({ user: { id: 'user-1' } });
      const res = makeRes();
      await runMiddleware(req, res);
      expect(res.statusCode).toBe(200);
      expect(mockStudentFindUnique).not.toHaveBeenCalled();
    });

    it('passes through when no authenticated user is present', async () => {
      workspaceContextStorage.run('workspace-a', async () => {
        const req = makeReq();
        const res = makeRes();
        await runMiddleware(req, res);
        expect(res.statusCode).toBe(200);
        expect(mockStudentFindUnique).not.toHaveBeenCalled();
      });
    });

    it('passes for admins without querying the database', async () => {
      workspaceContextStorage.run('workspace-a', async () => {
        const req = makeReq({ user: { id: 'admin-1', role: 'admin' } });
        const res = makeRes();
        await runMiddleware(req, res);
        expect(res.statusCode).toBe(200);
        expect(mockStudentFindUnique).not.toHaveBeenCalled();
      });
    });

    it('passes when the student belongs to the workspace', async () => {
      workspaceContextStorage.run('workspace-a', async () => {
        mockStudentFindUnique.mockResolvedValueOnce({ workspaceId: 'workspace-a' });
        const req = makeReq({ user: { id: 'student-1' } });
        const res = makeRes();
        await runMiddleware(req, res);
        expect(res.statusCode).toBe(200);
        expect(mockEnrollmentFindFirst).not.toHaveBeenCalled();
      });
    });

    it('passes when the student holds an active enrollment in the workspace', async () => {
      workspaceContextStorage.run('workspace-b', async () => {
        mockStudentFindUnique.mockResolvedValueOnce({ workspaceId: 'workspace-a' });
        mockEnrollmentFindFirst.mockResolvedValueOnce({ id: 'enr-1' });
        const req = makeReq({ user: { id: 'student-1' } });
        const res = makeRes();
        await runMiddleware(req, res);
        expect(res.statusCode).toBe(200);
        expect(mockEnrollmentFindFirst).toHaveBeenCalledWith({
          where: { studentId: 'student-1', workspaceId: 'workspace-b', status: 'active' },
          select: { id: true },
        });
      });
    });

    it('rejects with 403 and audits the violation when not enrolled', async () => {
      workspaceContextStorage.run('workspace-b', async () => {
        mockStudentFindUnique.mockResolvedValueOnce({ workspaceId: 'workspace-a' });
        mockEnrollmentFindFirst.mockResolvedValueOnce(null);
        const req = makeReq({ user: { id: 'student-1' } });
        const res = makeRes();
        await runMiddleware(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
          error: 'Forbidden: you do not belong to this workspace',
        });
        expect(mockLogAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'student-1',
            action: 'WORKSPACE_ACCESS_DENIED',
            entity: 'Workspace',
            entityId: 'workspace-b',
          })
        );
      });
    });

    it('fails closed with 403 when the membership lookup errors', async () => {
      workspaceContextStorage.run('workspace-b', async () => {
        mockStudentFindUnique.mockRejectedValueOnce(new Error('db down'));
        const req = makeReq({ user: { id: 'student-1' } });
        const res = makeRes();
        await runMiddleware(req, res);

        expect(res.statusCode).toBe(403);
        expect(mockLogAudit).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'WORKSPACE_ACCESS_DENIED' })
        );
      });
    });
  });
});
