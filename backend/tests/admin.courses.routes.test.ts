/**
 * Unit & Integration tests for src/routes/admin/courses.routes.ts
 */
import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Mock authentication behaviour
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock Prisma and Services
// ---------------------------------------------------------------------------
const mockPrismaCourseFindMany = jest.fn();
const mockPrismaCourseFindUnique = jest.fn();
const mockPrismaCourseCreate = jest.fn();
const mockPrismaCourseUpdate = jest.fn();
const mockPrismaCourseDelete = jest.fn();

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    course: {
      findMany: (...args: unknown[]) => mockPrismaCourseFindMany(...args),
      findUnique: (...args: unknown[]) => mockPrismaCourseFindUnique(...args),
      create: (...args: unknown[]) => mockPrismaCourseCreate(...args),
      update: (...args: unknown[]) => mockPrismaCourseUpdate(...args),
      delete: (...args: unknown[]) => mockPrismaCourseDelete(...args),
    },
  },
}));

const mockInvalidateAllCourses = jest.fn();
const mockInvalidateCourseCache = jest.fn();
jest.mock('../src/cache/CacheInvalidation.js', () => ({
  invalidateAllCourses: (...args: unknown[]) => mockInvalidateAllCourses(...args),
  invalidateCourseCache: (...args: unknown[]) => mockInvalidateCourseCache(...args),
}));

const mockCreateNotification = jest.fn();
jest.mock('../src/notifications/index.js', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/middleware/audit.js', () => ({
  auditAction: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import express from 'express';
import request from 'supertest';

let app: express.Application;

beforeAll(async () => {
  const { default: adminCoursesRouter } = await import(
    '../src/routes/admin/courses.routes.js'
  );
  app = express();
  app.use(express.json());
  app.use('/api/v1/admin/courses', adminCoursesRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthRole = 'admin';
  mockInvalidateAllCourses.mockResolvedValue(undefined);
  mockInvalidateCourseCache.mockResolvedValue(undefined);
  mockCreateNotification.mockResolvedValue(undefined);
});

describe('Admin Courses Routes (/api/v1/admin/courses)', () => {
  describe('Authorization & Authentication', () => {
    it('returns 401 when request is unauthenticated', async () => {
      mockAuthRole = 'unauthenticated';

      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send({
          title: 'Soroban Advanced Architecture',
          instructor: 'Stellar Expert',
        });

      expect(res.status).toBe(401);
      expect(mockPrismaCourseCreate).not.toHaveBeenCalled();
    });

    it('returns 403 when authenticated as non-admin (e.g. student)', async () => {
      mockAuthRole = 'student';

      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send({
          title: 'Soroban Advanced Architecture',
          instructor: 'Stellar Expert',
        });

      expect(res.status).toBe(403);
      expect(mockPrismaCourseCreate).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/admin/courses - Course Creation', () => {
    it('returns 400 if title is missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send({
          instructor: 'Jane Doe',
          credits: 3,
        });

      expect(res.status).toBe(400);
      expect(mockPrismaCourseCreate).not.toHaveBeenCalled();
    });

    it('returns 400 if title is too short (< 3 chars)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send({
          title: 'AB',
          instructor: 'Jane Doe',
        });

      expect(res.status).toBe(400);
      expect(mockPrismaCourseCreate).not.toHaveBeenCalled();
    });

    it('returns 400 if instructor is missing or invalid', async () => {
      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send({
          title: 'Soroban Contracts In Depth',
          instructor: '',
        });

      expect(res.status).toBe(400);
      expect(mockPrismaCourseCreate).not.toHaveBeenCalled();
    });

    it('returns 400 if credits exceeds allowed range', async () => {
      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send({
          title: 'Soroban Contracts In Depth',
          instructor: 'Jane Doe',
          credits: 20,
        });

      expect(res.status).toBe(400);
      expect(mockPrismaCourseCreate).not.toHaveBeenCalled();
    });

    it('successfully creates a course with 201 status and triggers invalidation + notification', async () => {
      const now = new Date();
      const mockCreated = {
        id: 'cuid-course-123',
        workspaceId: 'default',
        title: 'Building DeFi Protocols on Soroban',
        description: 'Comprehensive guide to Soroban DeFi development',
        instructor: 'Dr. Stellar',
        credits: 4,
        createdAt: now,
        updatedAt: now,
      };

      mockPrismaCourseCreate.mockResolvedValue(mockCreated);

      const payload = {
        title: 'Building DeFi Protocols on Soroban',
        description: 'Comprehensive guide to Soroban DeFi development',
        instructor: 'Dr. Stellar',
        credits: 4,
      };

      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.course.id).toBe('cuid-course-123');
      expect(res.body.data.course.title).toBe(payload.title);
      expect(mockPrismaCourseCreate).toHaveBeenCalledWith({
        data: {
          title: payload.title,
          description: payload.description,
          instructor: payload.instructor,
          credits: 4,
        },
      });
      expect(mockInvalidateAllCourses).toHaveBeenCalledTimes(1);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'course_created',
          courseId: 'cuid-course-123',
          courseTitle: payload.title,
        })
      );
    });

    it('returns 503 if database fails during course creation', async () => {
      mockPrismaCourseCreate.mockRejectedValue(new Error('DB Connection Failed'));

      const res = await request(app)
        .post('/api/v1/admin/courses')
        .send({
          title: 'Zero Knowledge on Soroban',
          instructor: 'ZK Researcher',
          credits: 5,
        });

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
    });
  });

  describe('GET /api/v1/admin/courses - List Courses', () => {
    it('returns list of courses with statistics', async () => {
      const now = new Date();
      mockPrismaCourseFindMany.mockResolvedValue([
        {
          id: 'course-1',
          title: 'Course 1',
          description: 'Desc 1',
          instructor: 'Prof A',
          credits: 3,
          createdAt: now,
          updatedAt: now,
          _count: {
            enrollments: 10,
            certificates: 5,
            feedback: 3,
          },
        },
      ]);

      const res = await request(app).get('/api/v1/admin/courses');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.count).toBe(1);
      expect(res.body.data.courses[0].id).toBe('course-1');
      expect(res.body.data.courses[0]._count.enrollments).toBe(10);
    });
  });

  describe('GET /api/v1/admin/courses/:id - Course Detail', () => {
    it('returns 404 when course is not found', async () => {
      mockPrismaCourseFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/v1/admin/courses/non-existent');

      expect(res.status).toBe(404);
    });

    it('returns course detail when found', async () => {
      const now = new Date();
      mockPrismaCourseFindUnique.mockResolvedValue({
        id: 'course-1',
        title: 'Course 1',
        description: 'Desc 1',
        instructor: 'Prof A',
        credits: 3,
        createdAt: now,
        updatedAt: now,
        _count: {
          enrollments: 10,
          certificates: 5,
          feedback: 3,
          learningProgress: 20,
        },
      });

      const res = await request(app).get('/api/v1/admin/courses/course-1');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.course.id).toBe('course-1');
    });
  });

  describe('PUT /api/v1/admin/courses/:id - Update Course', () => {
    it('returns 404 if course to update does not exist', async () => {
      mockPrismaCourseFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/v1/admin/courses/missing-id')
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
      expect(mockPrismaCourseUpdate).not.toHaveBeenCalled();
    });

    it('updates course and invalidates cache', async () => {
      const now = new Date();
      mockPrismaCourseFindUnique.mockResolvedValue({
        id: 'course-1',
        title: 'Old Title',
        description: 'Old Desc',
        instructor: 'Instructor',
        credits: 3,
      });

      mockPrismaCourseUpdate.mockResolvedValue({
        id: 'course-1',
        title: 'New Title',
        description: 'Old Desc',
        instructor: 'Instructor',
        credits: 3,
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(app)
        .put('/api/v1/admin/courses/course-1')
        .send({ title: 'New Title' });

      expect(res.status).toBe(200);
      expect(mockInvalidateCourseCache).toHaveBeenCalledWith('course-1');
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'course_updated',
          courseId: 'course-1',
          courseTitle: 'New Title',
        })
      );
    });
  });

  describe('DELETE /api/v1/admin/courses/:id - Delete Course', () => {
    it('returns 404 if course to delete does not exist', async () => {
      mockPrismaCourseFindUnique.mockResolvedValue(null);

      const res = await request(app).delete('/api/v1/admin/courses/missing-id');

      expect(res.status).toBe(404);
      expect(mockPrismaCourseDelete).not.toHaveBeenCalled();
    });

    it('deletes course, invalidates cache and returns 204', async () => {
      mockPrismaCourseFindUnique.mockResolvedValue({
        id: 'course-1',
        title: 'Title',
      });
      mockPrismaCourseDelete.mockResolvedValue({ id: 'course-1' });

      const res = await request(app).delete('/api/v1/admin/courses/course-1');

      expect(res.status).toBe(204);
      expect(mockPrismaCourseDelete).toHaveBeenCalledWith({ where: { id: 'course-1' } });
      expect(mockInvalidateCourseCache).toHaveBeenCalledWith('course-1');
    });
  });
});
