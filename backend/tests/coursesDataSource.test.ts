import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const courseCount = jest.fn();
const courseFindMany = jest.fn();
const courseCreate = jest.fn();
const courseFindUnique = jest.fn();
const courseUpdate = jest.fn();
const courseDelete = jest.fn();

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    course: {
      count: courseCount,
      findMany: courseFindMany,
      create: courseCreate,
      findUnique: courseFindUnique,
      update: courseUpdate,
      delete: courseDelete,
    },
  },
}));

jest.mock('../src/cache/CacheMiddleware.js', () => ({
  __esModule: true,
  cacheMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../src/cache/CacheInvalidation.js', () => ({
  __esModule: true,
  invalidateAllCourses: jest.fn().mockResolvedValue(undefined),
  invalidateCourseCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/middleware/audit.js', () => ({
  __esModule: true,
  auditAction: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../src/notifications/index.js', () => ({
  __esModule: true,
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLogger: { info: jest.fn() },
  getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
}));

async function buildApp() {
  const coursesRouter = (await import('../src/routes/courses.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/courses', coursesRouter);
  return app;
}

describe('GET /api/courses — explicit demo/live data source (#911)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns dataSource "live" with real courses when the database is reachable', async () => {
    courseCount.mockResolvedValue(1);
    courseFindMany.mockResolvedValue([
      {
        id: 'course-real',
        title: 'Real Course',
        description: 'desc',
        instructor: 'Real Instructor',
        credits: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const app = await buildApp();
    const response = await request(app).get('/api/courses');

    expect(response.status).toBe(200);
    expect(response.body.dataSource).toBe('live');
    expect(response.body.courses[0].title).toBe('Real Course');
  });

  it('returns dataSource "demo" and a warning message instead of silently passing off demo data as live', async () => {
    courseCount.mockRejectedValue(new Error('connection refused'));

    const app = await buildApp();
    const response = await request(app).get('/api/courses');

    expect(response.status).toBe(200);
    expect(response.body.dataSource).toBe('demo');
    expect(response.body.message).toMatch(/demo/i);
    expect(Array.isArray(response.body.courses)).toBe(true);
    expect(response.body.courses.length).toBeGreaterThan(0);
  });

  it('POST /api/courses fails explicitly (503) instead of pretending to save when the database is down', async () => {
    courseCreate.mockRejectedValue(new Error('connection refused'));

    const app = await buildApp();
    const response = await request(app)
      .post('/api/courses')
      .send({ title: 'New', instructor: 'Someone' });

    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/unavailable/i);
  });
});
