import { jest } from '@jest/globals';

const courseFindMany = jest.fn();
const courseCount = jest.fn();
const courseCreate = jest.fn();
const learningProgressFindUnique = jest.fn();
const learningProgressUpsert = jest.fn();
const studentActivityCreate = jest.fn().mockResolvedValue({});
const webhookSubscriptionFindMany = jest.fn().mockResolvedValue([]);
const studentFindUnique = jest.fn().mockResolvedValue(null);

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    course: {
      findMany: courseFindMany,
      count: courseCount,
      create: courseCreate,
    },
    learningProgress: {
      findUnique: learningProgressFindUnique,
      upsert: learningProgressUpsert,
    },
    studentActivity: {
      create: studentActivityCreate,
    },
    webhookSubscription: {
      findMany: webhookSubscriptionFindMany,
    },
    student: {
      findUnique: studentFindUnique,
    },
  },
}));

jest.mock('../src/cache/CacheService.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
  CACHE_KEYS: {
    courses: { list: () => 'courses:list', curriculum: (id: string) => `courses:curriculum:${id}` },
    user: { progress: (id: string) => `user:${id}:progress` },
  },
}));

jest.mock('../src/cache/CacheInvalidation.js', () => ({
  __esModule: true,
  invalidateUserProgressCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/webhooks/index.js', () => ({
  __esModule: true,
  enqueueWebhookDeliveries: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLogger: { info: jest.fn() },
  getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
}));

describe('Learning data-source transparency (#911)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports dataSource "live" when the database responds normally', async () => {
    const { listCourses } = await import('../src/routes/learning/learning.service.js');
    courseFindMany.mockResolvedValue([
      {
        id: 'course-1',
        title: 'Real Course',
        description: 'desc',
        instructor: 'Real Instructor',
        credits: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await listCourses();
    expect(result.dataSource).toBe('live');
    expect(result.data[0].title).toBe('Real Course');
  });

  it('reports dataSource "demo" and logs the failure instead of masquerading as live data on DB outage', async () => {
    const { listCourses } = await import('../src/routes/learning/learning.service.js');
    const logger = (await import('../src/utils/logger.js')).default;
    courseFindMany.mockRejectedValue(new Error('connection refused'));

    const result = await listCourses();
    expect(result.dataSource).toBe('demo');
    expect(result.data.length).toBeGreaterThan(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('getCourseCurriculum reports demo dataSource on DB outage', async () => {
    const { getCourseCurriculum } = await import('../src/routes/learning/learning.service.js');
    const { default: prisma } = await import('../src/db/index.js');
    (prisma as any).course.findUnique = jest.fn().mockRejectedValue(new Error('down'));

    const result = await getCourseCurriculum('course-1');
    expect(result.dataSource).toBe('demo');
  });

  it('updateStudentProgress persists to the database and never fakes success against mock data', async () => {
    const { updateStudentProgress } = await import('../src/routes/learning/learning.service.js');
    const { default: prisma } = await import('../src/db/index.js');
    (prisma as any).course.findUnique = jest.fn().mockResolvedValue({
      id: 'course-1',
      title: 'Course',
      description: '',
      instructor: 'I',
      credits: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    learningProgressFindUnique.mockResolvedValue(null);
    learningProgressUpsert.mockResolvedValue({
      id: 'progress-1',
      studentId: 'student-1',
      courseId: 'course-1',
      completedLessons: ['course-1-lesson-1'],
      currentModuleId: 'course-1-module-1',
      percentage: 10,
      status: 'in_progress',
      lastAccessedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await updateStudentProgress('student-1', 'course-1', {
      lessonId: 'course-1-lesson-1',
      status: 'completed',
    });

    expect(learningProgressUpsert).toHaveBeenCalledTimes(1);
    expect(result.completedLessons).toContain('course-1-lesson-1');
  });

  it('updateStudentProgress throws ProgressPersistenceError instead of silently succeeding when the DB is down', async () => {
    const { updateStudentProgress, ProgressPersistenceError } = await import(
      '../src/routes/learning/learning.service.js'
    );
    learningProgressFindUnique.mockRejectedValue(new Error('down'));
    learningProgressUpsert.mockRejectedValue(new Error('down'));

    await expect(
      updateStudentProgress('student-1', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      })
    ).rejects.toThrow(ProgressPersistenceError);

    // Must not have attempted to persist anything as if it succeeded.
    expect(learningProgressUpsert).toHaveBeenCalledTimes(1);
  });
});
