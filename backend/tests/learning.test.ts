import request from 'supertest';
import prisma from '../src/db/index.js';
import { app } from '../src/index.js';

const courseFixtures = [
  {
    id: 'course-1',
    title: 'Soroban 101: Smart Contract Basics',
    description: 'Learn the fundamentals of Soroban smart contracts on the Stellar network.',
    instructor: 'Stellar Dev Hub',
    credits: 3,
  },
  {
    id: 'course-2',
    title: 'Stellar Blockchain Fundamentals',
    description: 'Understand how the Stellar blockchain works.',
    instructor: 'Web3 Academy',
    credits: 2,
  },
];

const registerStudent = async (email: string) => {
  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'password123',
    firstName: 'Test',
    lastName: 'Student',
  });

  return {
    token: response.body.token as string,
    userId: response.body.user.id as string,
  };
};

// Check if database is available before running tests
let dbAvailable = false;
beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch (_error) {
    console.warn('Database not available, skipping learning tests');
  }
});

const describeOrSkip = dbAvailable ? describe : describe.skip;

describeOrSkip('Learning Module Integration Tests', () => {
  beforeEach(async () => {
    if (!dbAvailable) return;
    await prisma.learningProgress.deleteMany();
    await prisma.feedback.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.course.deleteMany();
    await prisma.student.deleteMany();

    await prisma.course.createMany({
      data: courseFixtures,
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.$disconnect();
  });

  describe('GET /api/v1/learning/courses', () => {
    it('returns course curriculum data', async () => {
      const response = await request(app).get('/api/v1/learning/courses').expect(200);

      expect(response.body.courses).toHaveLength(2);
      expect(response.body.courses[0]).toHaveProperty('modules');
      expect(response.body.courses[0].modules[0]).toHaveProperty('lessons');
    });

    it('filters nested lessons by difficulty', async () => {
      const response = await request(app)
        .get('/api/v1/learning/courses?difficulty=beginner')
        .expect(200);

      interface TestLesson {
        difficulty: string;
      }
      interface TestModule {
        lessons: TestLesson[];
      }
      interface TestCourse {
        modules: TestModule[];
      }

      response.body.courses.forEach((course: TestCourse) => {
        course.modules.forEach((module: TestModule) => {
          module.lessons.forEach((lesson: TestLesson) => {
            expect(lesson.difficulty).toBe('beginner');
          });
        });
      });
    });
  });

  describe('GET /api/v1/learning/courses/:courseId', () => {
    it('returns a single course with curriculum', async () => {
      const response = await request(app).get('/api/v1/learning/courses/course-1').expect(200);

      expect(response.body.course.id).toBe('course-1');
      expect(response.body.course.modules.length).toBeGreaterThan(0);
    });

    it('returns 404 when the course does not exist', async () => {
      const response = await request(app)
        .get('/api/v1/learning/courses/unknown-course')
        .expect(404);

      expect(response.body.error).toBe('Course not found');
    });
  });

  describe('GET /api/v1/learning/courses/:courseId/progress', () => {
    it('rejects unauthenticated access', async () => {
      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .expect(401);

      expect(response.body.error).toBe('Authorization token required');
    });

    it('returns default progress for a student without a record', async () => {
      const student = await registerStudent('progress-default@example.com');

      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      expect(response.body.progress.studentId).toBe(student.userId);
      expect(response.body.progress.courseId).toBe('course-1');
      expect(response.body.progress.completedLessons).toEqual([]);
      expect(response.body.progress.status).toBe('not_started');
    });

    it("does not expose another student's progress", async () => {
      const firstStudent = await registerStudent('first-progress@example.com');
      const secondStudent = await registerStudent('second-progress@example.com');

      await prisma.learningProgress.create({
        data: {
          studentId: firstStudent.userId,
          courseId: 'course-1',
          completedLessons: ['course-1-lesson-1'],
          currentModuleId: 'course-1-module-1',
          percentage: 25,
          status: 'in_progress',
          lastAccessedAt: new Date(),
        },
      });

      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${secondStudent.token}`)
        .expect(200);

      expect(response.body.progress.studentId).toBe(secondStudent.userId);
      expect(response.body.progress.completedLessons).toEqual([]);
    });
  });

  describe('PATCH /api/v1/learning/courses/:courseId/progress', () => {
    it('creates progress on first update and persists it', async () => {
      const student = await registerStudent('progress-update@example.com');

      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      expect(response.body.progress.studentId).toBe(student.userId);
      expect(response.body.progress.completedLessons).toContain('course-1-lesson-1');
      expect(response.body.progress.status).toBe('in_progress');

      const stored = await prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: student.userId,
            courseId: 'course-1',
          },
        },
      });

      expect(stored?.completedLessons).toContain('course-1-lesson-1');
      expect(stored?.percentage).toBe(25);
    });

    it('updates an existing progress row instead of inserting a duplicate', async () => {
      const student = await registerStudent('progress-upsert@example.com');

      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-2',
          status: 'completed',
          percentage: 50,
        })
        .expect(200);

      expect(response.body.progress.completedLessons).toEqual([
        'course-1-lesson-1',
        'course-1-lesson-2',
      ]);
      expect(response.body.progress.percentage).toBe(50);

      const recordCount = await prisma.learningProgress.count({
        where: {
          studentId: student.userId,
          courseId: 'course-1',
        },
      });

      expect(recordCount).toBe(1);
    });

    it('returns 400 for an out-of-range percentage', async () => {
      const student = await registerStudent('invalid-percentage@example.com');

      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
          percentage: 101,
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('returns 400 for an invalid course id parameter', async () => {
      const student = await registerStudent('invalid-course-param@example.com');

      const response = await request(app)
        .patch('/api/v1/learning/courses/%20/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(400);

      expect(response.body.error).toBe('Parameter validation failed');
    });

    it('returns 404 when the lesson does not exist in the course curriculum', async () => {
      const student = await registerStudent('unknown-lesson@example.com');

      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-2-lesson-1',
          status: 'completed',
        })
        .expect(404);

      expect(response.body.error).toBe('Lesson not found');
    });

    it("keeps each student's progress isolated", async () => {
      const firstStudent = await registerStudent('owner-progress@example.com');
      const secondStudent = await registerStudent('other-progress@example.com');

      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${firstStudent.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${secondStudent.token}`)
        .send({
          lessonId: 'course-1-lesson-2',
          status: 'completed',
        })
        .expect(200);

      expect(response.body.progress.studentId).toBe(secondStudent.userId);
      expect(response.body.progress.completedLessons).toEqual(['course-1-lesson-2']);

      const firstStudentRecord = await prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: firstStudent.userId,
            courseId: 'course-1',
          },
        },
      });

      expect(firstStudentRecord?.completedLessons).toEqual(['course-1-lesson-1']);
    });
  });
});
