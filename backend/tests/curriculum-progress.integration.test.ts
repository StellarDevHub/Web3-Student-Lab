/**
 * Curriculum and Progress Integration Tests
 *
 * Full end-to-end tests covering API routes, database operations,
 * authentication, and caching in realistic scenarios.
 */

import request from 'supertest';
import { app } from '../src/index.js';
import prisma from '../src/db/index.js';

// Test fixtures
const courseFixtures = [
  {
    id: 'course-1',
    title: 'Soroban Smart Contracts',
    description: 'Master smart contract development on Stellar',
    instructor: 'Stellar Dev Hub',
    credits: 3,
  },
  {
    id: 'course-2',
    title: 'Stellar Blockchain Fundamentals',
    description: 'Core concepts of the Stellar network',
    instructor: 'Web3 Academy',
    credits: 2,
  },
  {
    id: 'course-3',
    title: 'Full-Stack Web3',
    description: 'Build complete decentralized applications',
    instructor: 'Web3 Lab',
    credits: 4,
  },
];

// Helper: Register and get auth token
const registerStudent = async (email: string, password = 'SecurePass123!') => {
  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    firstName: 'Test',
    lastName: 'Student',
  });

  return {
    token: response.body.token as string,
    userId: response.body.user.id as string,
    email: response.body.user.email as string,
  };
};

// Database availability check
let dbAvailable = false;
beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$executeRaw`SELECT 1`;
    dbAvailable = true;
    console.log('✓ Database connection established for integration tests');
  } catch (error) {
    console.warn('⚠ Database not available, skipping integration tests', error);
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.$disconnect();
  }
});

describe('Curriculum & Progress Integration Tests', () => {
  // Clean database before each test
  beforeEach(async () => {
    if (!dbAvailable) return;

    await prisma.learningProgress.deleteMany();
    await prisma.studentActivity.deleteMany();
    await prisma.feedback.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.course.deleteMany();
    await prisma.student.deleteMany();

    // Seed courses
    await prisma.course.createMany({
      data: courseFixtures,
    });
  });

  describe('GET /api/v1/learning/courses', () => {
    it('should return list of all courses with curriculum', async () => {
      // Act: Request course list
      const response = await request(app).get('/api/v1/learning/courses').expect(200);

      // Assert: All courses returned with modules
      expect(response.body.courses).toHaveLength(3);
      expect(response.body.courses[0]).toHaveProperty('id');
      expect(response.body.courses[0]).toHaveProperty('title');
      expect(response.body.courses[0]).toHaveProperty('modules');
      expect(response.body.courses[0]).toHaveProperty('instructor');
      expect(response.body.courses[0]).toHaveProperty('credits');

      // Each course should have nested lessons
      response.body.courses.forEach((course: any) => {
        expect(Array.isArray(course.modules)).toBe(true);
        if (course.modules.length > 0) {
          expect(course.modules[0]).toHaveProperty('lessons');
        }
      });
    });

    it('should filter lessons by difficulty level', async () => {
      // Act: Request only beginner lessons
      const response = await request(app)
        .get('/api/v1/learning/courses?difficulty=beginner')
        .expect(200);

      // Assert: Only beginner lessons returned
      expect(response.body.courses).toBeDefined();
      response.body.courses.forEach((course: any) => {
        course.modules.forEach((module: any) => {
          module.lessons.forEach((lesson: any) => {
            expect(lesson.difficulty).toBe('beginner');
          });
        });
      });
    });

    it('should filter lessons for intermediate difficulty', async () => {
      // Act: Request intermediate lessons
      const response = await request(app)
        .get('/api/v1/learning/courses?difficulty=intermediate')
        .expect(200);

      // Assert: Only intermediate lessons returned
      response.body.courses.forEach((course: any) => {
        course.modules.forEach((module: any) => {
          module.lessons.forEach((lesson: any) => {
            expect(lesson.difficulty).toBe('intermediate');
          });
        });
      });
    });

    it('should filter lessons for advanced difficulty', async () => {
      // Act: Request advanced lessons
      const response = await request(app)
        .get('/api/v1/learning/courses?difficulty=advanced')
        .expect(200);

      // Assert: Only advanced lessons returned
      response.body.courses.forEach((course: any) => {
        course.modules.forEach((module: any) => {
          module.lessons.forEach((lesson: any) => {
            expect(lesson.difficulty).toBe('advanced');
          });
        });
      });
    });

    it('should handle empty difficulty filter gracefully', async () => {
      // Act: Request with empty difficulty
      const response = await request(app)
        .get('/api/v1/learning/courses?difficulty=')
        .expect(200);

      // Assert: All lessons returned (no filter applied)
      expect(response.body.courses).toBeDefined();
    });
  });

  describe('GET /api/v1/learning/courses/:courseId', () => {
    it('should return specific course with full curriculum', async () => {
      // Act: Request specific course
      const response = await request(app).get('/api/v1/learning/courses/course-1').expect(200);

      // Assert: Course details and curriculum returned
      expect(response.body.course.id).toBe('course-1');
      expect(response.body.course.title).toBe('Soroban Smart Contracts');
      expect(response.body.course.modules).toBeDefined();
      expect(response.body.course.modules.length).toBeGreaterThan(0);
      expect(response.body.course.instructor).toBe('Stellar Dev Hub');
      expect(response.body.course.credits).toBe(3);
    });

    it('should return filtered curriculum for specific difficulty', async () => {
      // Act: Request course with difficulty filter
      const response = await request(app)
        .get('/api/v1/learning/courses/course-1?difficulty=beginner')
        .expect(200);

      // Assert: Only beginner lessons in curriculum
      response.body.course.modules.forEach((module: any) => {
        module.lessons.forEach((lesson: any) => {
          expect(lesson.difficulty).toBe('beginner');
        });
      });
    });

    it('should return 404 for non-existent course', async () => {
      // Act: Request invalid course
      const response = await request(app)
        .get('/api/v1/learning/courses/invalid-course-id')
        .expect(404);

      // Assert: Error message returned
      expect(response.body.error).toBe('Course not found');
    });

    it('should return 400 for malformed course ID', async () => {
      // Act: Request with malformed ID
      const response = await request(app)
        .get('/api/v1/learning/courses/%20')
        .expect(400);

      // Assert: Validation error
      expect(response.body.error).toContain('validation');
    });
  });

  describe('GET /api/v1/learning/courses/:courseId/progress', () => {
    it('should require authentication', async () => {
      // Act: Request without token
      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .expect(401);

      // Assert: Auth error returned
      expect(response.body.error).toBe('Authorization token required');
    });

    it('should return initial progress for new student', async () => {
      // Arrange: Register student
      const student = await registerStudent('newstudent@example.com');

      // Act: Get progress for course never started
      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      // Assert: Default progress structure returned
      expect(response.body.progress).toMatchObject({
        studentId: student.userId,
        courseId: 'course-1',
        completedLessons: [],
        percentage: 0,
        status: 'not_started',
        completedAt: null,
      });
      expect(response.body.progress).toHaveProperty('currentModuleId');
      expect(response.body.progress).toHaveProperty('lastAccessedAt');
    });

    it('should return existing progress from database', async () => {
      // Arrange: Register student and create progress
      const student = await registerStudent('progressstudent@example.com');

      await prisma.learningProgress.create({
        data: {
          studentId: student.userId,
          courseId: 'course-1',
          completedLessons: ['course-1-lesson-1', 'course-1-lesson-2'],
          currentModuleId: 'course-1-module-1',
          percentage: 50,
          status: 'in_progress',
          lastAccessedAt: new Date(),
        },
      });

      // Act: Get existing progress
      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      // Assert: Existing progress returned correctly
      expect(response.body.progress.completedLessons).toEqual([
        'course-1-lesson-1',
        'course-1-lesson-2',
      ]);
      expect(response.body.progress.percentage).toBe(50);
      expect(response.body.progress.status).toBe('in_progress');
    });

    it('should isolate progress between different students', async () => {
      // Arrange: Two students
      const student1 = await registerStudent('student1@example.com');
      const student2 = await registerStudent('student2@example.com');

      // Student 1 has progress
      await prisma.learningProgress.create({
        data: {
          studentId: student1.userId,
          courseId: 'course-1',
          completedLessons: ['course-1-lesson-1'],
          currentModuleId: 'course-1-module-1',
          percentage: 25,
          status: 'in_progress',
          lastAccessedAt: new Date(),
        },
      });

      // Act: Student 2 gets their own progress
      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student2.token}`)
        .expect(200);

      // Assert: Student 2 has fresh progress, not student 1's
      expect(response.body.progress.studentId).toBe(student2.userId);
      expect(response.body.progress.completedLessons).toEqual([]);
      expect(response.body.progress.percentage).toBe(0);
    });

    it('should return 400 for malformed course ID in progress endpoint', async () => {
      // Arrange: Register student
      const student = await registerStudent('validation@example.com');

      // Act: Request with invalid course ID
      const response = await request(app)
        .get('/api/v1/learning/courses/%20/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(400);

      // Assert: Validation error
      expect(response.body.error).toContain('validation');
    });
  });

  describe('PATCH /api/v1/learning/courses/:courseId/progress', () => {
    it('should require authentication', async () => {
      // Act: Update without token
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(401);

      // Assert: Auth error
      expect(response.body.error).toBe('Authorization token required');
    });

    it('should create initial progress on first lesson completion', async () => {
      // Arrange: Register student
      const student = await registerStudent('firstlesson@example.com');

      // Act: Complete first lesson
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      // Assert: Progress created with lesson marked
      expect(response.body.progress.completedLessons).toContain('course-1-lesson-1');
      expect(response.body.progress.status).toBe('in_progress');
      expect(response.body.progress.percentage).toBeGreaterThan(0);

      // Verify persistence in database
      const dbProgress = await prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: student.userId,
            courseId: 'course-1',
          },
        },
      });

      expect(dbProgress).toBeDefined();
      expect(dbProgress?.completedLessons).toContain('course-1-lesson-1');
    });

    it('should update existing progress without creating duplicate', async () => {
      // Arrange: Student with existing progress
      const student = await registerStudent('updateprogress@example.com');

      // First update
      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      // Act: Second update (different lesson)
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-2',
          status: 'completed',
        })
        .expect(200);

      // Assert: Progress updated, not duplicated
      expect(response.body.progress.completedLessons).toEqual([
        'course-1-lesson-1',
        'course-1-lesson-2',
      ]);

      // Verify only one record exists
      const recordCount = await prisma.learningProgress.count({
        where: {
          studentId: student.userId,
          courseId: 'course-1',
        },
      });

      expect(recordCount).toBe(1);
    });

    it('should calculate percentage correctly based on total lessons', async () => {
      // Arrange: Register student
      const student = await registerStudent('percentage@example.com');

      // Act: Complete one lesson (course-1 has 4 lessons total)
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      // Assert: Percentage calculated
      expect(response.body.progress.percentage).toBe(25);
    });

    it('should use explicit percentage when provided', async () => {
      // Arrange: Register student
      const student = await registerStudent('explicit@example.com');

      // Act: Complete lesson with explicit percentage
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
          percentage: 42,
        })
        .expect(200);

      // Assert: Explicit percentage used
      expect(response.body.progress.percentage).toBe(42);
    });

    it('should validate percentage range (0-100)', async () => {
      // Arrange: Register student
      const student = await registerStudent('invalidpercentage@example.com');

      // Act: Send invalid percentage
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
          percentage: 150,
        })
        .expect(400);

      // Assert: Validation error
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate percentage is non-negative', async () => {
      // Arrange: Register student
      const student = await registerStudent('negativepercentage@example.com');

      // Act: Send negative percentage
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
          percentage: -10,
        })
        .expect(400);

      // Assert: Validation error
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent lesson in course', async () => {
      // Arrange: Register student
      const student = await registerStudent('invalidlesson@example.com');

      // Act: Complete invalid lesson ID
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'invalid-lesson-id',
          status: 'completed',
        })
        .expect(404);

      // Assert: Lesson not found error
      expect(response.body.error).toBe('Lesson not found');
    });

    it('should return 404 for lesson from different course', async () => {
      // Arrange: Register student
      const student = await registerStudent('wrongcourse@example.com');

      // Act: Try to complete course-2 lesson in course-1 progress
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-2-lesson-1',
          status: 'completed',
        })
        .expect(404);

      // Assert: Lesson not found
      expect(response.body.error).toBe('Lesson not found');
    });

    it('should not duplicate lessons when marking as completed twice', async () => {
      // Arrange: Register student and complete lesson
      const student = await registerStudent('duplicate@example.com');

      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      // Act: Complete same lesson again
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      // Assert: Lesson appears only once
      const lessonOccurrences = response.body.progress.completedLessons.filter(
        (l: string) => l === 'course-1-lesson-1'
      ).length;
      expect(lessonOccurrences).toBe(1);
    });

    it('should mark course as completed when all lessons are done', async () => {
      // Arrange: Register student
      const student = await registerStudent('completecourse@example.com');

      // Complete all 4 lessons
      for (let i = 1; i <= 4; i++) {
        await request(app)
          .patch('/api/v1/learning/courses/course-1/progress')
          .set('Authorization', `Bearer ${student.token}`)
          .send({
            lessonId: `course-1-lesson-${i}`,
            status: 'completed',
          })
          .expect(200);
      }

      // Act: Get final progress
      const response = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      // Assert: Course marked as completed
      expect(response.body.progress.status).toBe('completed');
      expect(response.body.progress.percentage).toBe(100);
      expect(response.body.progress.completedAt).not.toBeNull();
    });

    it('should isolate progress updates between students', async () => {
      // Arrange: Two students
      const student1 = await registerStudent('isolated1@example.com');
      const student2 = await registerStudent('isolated2@example.com');

      // Act: Both complete different lessons
      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student1.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student2.token}`)
        .send({
          lessonId: 'course-1-lesson-2',
          status: 'completed',
        })
        .expect(200);

      // Assert: Each student has their own progress
      const progress1 = await prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: student1.userId,
            courseId: 'course-1',
          },
        },
      });

      const progress2 = await prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: student2.userId,
            courseId: 'course-1',
          },
        },
      });

      expect(progress1?.completedLessons).toEqual(['course-1-lesson-1']);
      expect(progress2?.completedLessons).toEqual(['course-1-lesson-2']);
    });

    it('should remove lesson when marking as not completed', async () => {
      // Arrange: Student with completed lesson
      const student = await registerStudent('uncomplete@example.com');

      // Complete lesson first
      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      // Act: Mark as not completed
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'not_started',
        })
        .expect(200);

      // Assert: Lesson removed from completed list
      expect(response.body.progress.completedLessons).not.toContain('course-1-lesson-1');
    });

    it('should validate required fields in request body', async () => {
      // Arrange: Register student
      const student = await registerStudent('missingfields@example.com');

      // Act: Send request without lessonId
      const response = await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          status: 'completed',
        })
        .expect(400);

      // Assert: Validation error
      expect(response.body.error).toBe('Validation failed');
    });

    it('should update lastAccessedAt timestamp on progress update', async () => {
      // Arrange: Register student
      const student = await registerStudent('timestamp@example.com');

      const beforeTime = new Date();

      // Act: Complete lesson
      await request(app)
        .patch('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          lessonId: 'course-1-lesson-1',
          status: 'completed',
        })
        .expect(200);

      const afterTime = new Date();

      // Assert: Timestamp updated
      const progress = await prisma.learningProgress.findUnique({
        where: {
          studentId_courseId: {
            studentId: student.userId,
            courseId: 'course-1',
          },
        },
      });

      expect(progress?.lastAccessedAt).toBeDefined();
      expect(progress?.lastAccessedAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(progress?.lastAccessedAt!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('End-to-End User Journey', () => {
    it('should support complete learning flow from registration to course completion', async () => {
      // Step 1: Register student
      const student = await registerStudent('journeystudent@example.com');
      expect(student.token).toBeDefined();

      // Step 2: List available courses
      const coursesResponse = await request(app)
        .get('/api/v1/learning/courses')
        .expect(200);
      expect(coursesResponse.body.courses.length).toBeGreaterThan(0);

      // Step 3: Get curriculum for course-1
      const curriculumResponse = await request(app)
        .get('/api/v1/learning/courses/course-1')
        .expect(200);
      expect(curriculumResponse.body.course.modules).toBeDefined();

      // Step 4: Check initial progress (should be empty)
      const initialProgressResponse = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);
      expect(initialProgressResponse.body.progress.status).toBe('not_started');

      // Step 5: Complete all lessons in course
      for (let i = 1; i <= 4; i++) {
        await request(app)
          .patch('/api/v1/learning/courses/course-1/progress')
          .set('Authorization', `Bearer ${student.token}`)
          .send({
            lessonId: `course-1-lesson-${i}`,
            status: 'completed',
          })
          .expect(200);
      }

      // Step 6: Verify course completion
      const finalProgressResponse = await request(app)
        .get('/api/v1/learning/courses/course-1/progress')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      expect(finalProgressResponse.body.progress.status).toBe('completed');
      expect(finalProgressResponse.body.progress.percentage).toBe(100);
      expect(finalProgressResponse.body.progress.completedLessons).toHaveLength(4);
    });
  });
});
