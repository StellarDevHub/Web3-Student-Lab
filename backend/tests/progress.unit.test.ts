/**
 * Progress Service Unit Tests
 *
 * Tests student progress tracking, lesson completion, and percentage calculation.
 * Covers database success paths, fallback scenarios, and edge cases.
 */

import { jest } from '@jest/globals';

// Mock dependencies before imports
const mockPrismaFindUnique = jest.fn();
const mockPrismaUpsert = jest.fn();
const mockPrismaStudentActivityCreate = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockInvalidateUserProgressCache = jest.fn();

jest.unstable_mockModule('../src/db/index.ts', () => ({
  default: {
    learningProgress: {
      findUnique: mockPrismaFindUnique,
      upsert: mockPrismaUpsert,
    },
    studentActivity: {
      create: mockPrismaStudentActivityCreate,
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

jest.unstable_mockModule('../src/cache/CacheService.js', () => ({
  default: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
  CACHE_KEYS: {
    courses: {
      list: () => 'courses:list',
      curriculum: (id: string) => `course:${id}:curriculum`,
    },
    user: {
      progress: (userId: string) => `user:${userId}:progress`,
    },
  },
}));

jest.unstable_mockModule('../src/cache/CacheInvalidation.js', () => ({
  invalidateUserProgressCache: mockInvalidateUserProgressCache,
}));

let getStudentProgress: any;
let updateStudentProgress: any;

describe('Progress Service - Unit Tests', () => {
  beforeAll(async () => {
    const service = await import('../src/routes/learning/learning.service.js');
    getStudentProgress = service.getStudentProgress;
    updateStudentProgress = service.updateStudentProgress;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaFindUnique.mockClear();
    mockPrismaUpsert.mockClear();
    mockPrismaStudentActivityCreate.mockClear();
    mockCacheGet.mockClear();
    mockCacheSet.mockClear();
    // Default: no cache hit
    mockCacheGet.mockResolvedValue(null);
    // Default: activity logging succeeds
    mockPrismaStudentActivityCreate.mockResolvedValue({});
    mockInvalidateUserProgressCache.mockResolvedValue(undefined);
  });

  describe('getStudentProgress()', () => {
    it('should return progress from cache when available', async () => {
      // Arrange: Populate cache with existing progress
      const cachedProgress = {
        id: 'progress-1',
        studentId: 'student-1',
        courseId: 'course-1',
        completedLessons: ['course-1-lesson-1'],
        currentModuleId: 'course-1-module-1',
        percentage: 25,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCacheGet.mockResolvedValueOnce(cachedProgress);

      // Act: Get progress
      const result = await getStudentProgress('student-1', 'course-1');

      // Assert: Cached data returned, DB not queried
      expect(result).toEqual(cachedProgress);
      expect(mockPrismaFindUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database when cache misses', async () => {
      // Arrange: Mock database progress
      const dbProgress = {
        id: 'progress-db-1',
        studentId: 'student-1',
        courseId: 'course-1',
        completedLessons: ['course-1-lesson-1', 'course-1-lesson-2'],
        currentModuleId: 'course-1-module-1',
        percentage: 50,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(dbProgress);

      // Act: Get progress
      const result = await getStudentProgress('student-1', 'course-1');

      // Assert: Database queried correctly
      expect(mockPrismaFindUnique).toHaveBeenCalledWith({
        where: {
          studentId_courseId: {
            studentId: 'student-1',
            courseId: 'course-1',
          },
        },
      });
      expect(result.completedLessons).toContain('course-1-lesson-1');
      expect(result.percentage).toBe(50);
    });

    it('should return default initial progress when no record exists', async () => {
      // Arrange: No progress in cache or database
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      // Act: Get progress for new student
      const result = await getStudentProgress('new-student', 'course-1');

      // Assert: Default progress structure returned
      expect(result).toMatchObject({
        studentId: 'new-student',
        courseId: 'course-1',
        completedLessons: [],
        percentage: 0,
        status: 'not_started',
        completedAt: null,
      });
    });

    it('should seed currentModuleId from curriculum for initial progress', async () => {
      // Arrange: No existing progress
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      // Act: Get initial progress for course with modules
      const result = await getStudentProgress('student-new', 'course-1');

      // Assert: First module ID set as current
      expect(result.currentModuleId).toBeDefined();
    });

    it('should fallback to mock store when database fails', async () => {
      // Arrange: Database error
      mockPrismaFindUnique.mockRejectedValueOnce(new Error('DB Connection failed'));

      // Act: Get progress despite DB failure
      const result = await getStudentProgress('student-fallback', 'course-1');

      // Assert: No error thrown, fallback used
      expect(result).toBeDefined();
      expect(result.studentId).toBe('student-fallback');
    });

    it('should cache database result for subsequent requests', async () => {
      // Arrange: Mock successful DB fetch
      const dbProgress = {
        id: 'progress-1',
        studentId: 'cache-test-student',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: null,
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(dbProgress);

      // Act: Get progress
      await getStudentProgress('cache-test-student', 'course-1');

      // Assert: Result was cached
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should correctly use progress key for different student-course combinations', async () => {
      // Arrange: Multiple students' progress in cache
      mockPrismaFindUnique.mockResolvedValue(null);

      // Act: Get progress for two different students
      const [progress1, progress2] = await Promise.all([
        getStudentProgress('student-A', 'course-1'),
        getStudentProgress('student-B', 'course-1'),
      ]);

      // Assert: Each student has their own progress
      expect(progress1.studentId).toBe('student-A');
      expect(progress2.studentId).toBe('student-B');
    });
  });

  describe('updateStudentProgress()', () => {
    it('should throw LESSON_NOT_FOUND for invalid lesson', async () => {
      // Act & Assert: Invalid lesson throws error
      await expect(
        updateStudentProgress('student-1', 'course-1', {
          lessonId: 'invalid-lesson-id',
          status: 'completed',
        })
      ).rejects.toThrow('LESSON_NOT_FOUND');
    });

    it('should add lesson to completedLessons when marking as completed', async () => {
      // Arrange: Existing progress in DB
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-add',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: 'course-1-module-1',
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);

      // Mock upsert to return updated progress
      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: ['course-1-lesson-1'],
        percentage: 25,
        status: 'in_progress',
      });

      // Act: Complete a lesson
      const result = await updateStudentProgress('student-add', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      });

      // Assert: Lesson added to completed set
      expect(result.completedLessons).toContain('course-1-lesson-1');
      expect(result.status).toBe('in_progress');
    });

    it('should remove lesson from completedLessons when marking as not completed', async () => {
      // Arrange: Progress with completed lesson
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-remove',
        courseId: 'course-1',
        completedLessons: ['course-1-lesson-1'],
        currentModuleId: 'course-1-module-1',
        percentage: 25,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);

      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: [],
        percentage: 0,
        status: 'not_started',
      });

      // Act: Mark lesson as not completed
      const result = await updateStudentProgress('student-remove', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'not_started',
      });

      // Assert: Lesson removed from completed set
      expect(result.completedLessons).not.toContain('course-1-lesson-1');
    });

    it('should not duplicate completed lessons on re-completion', async () => {
      // Arrange: Lesson already completed
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-nodedup',
        courseId: 'course-1',
        completedLessons: ['course-1-lesson-1'],
        currentModuleId: 'course-1-module-1',
        percentage: 25,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);

      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: ['course-1-lesson-1'],
        percentage: 25,
      });

      // Act: Complete same lesson again
      const result = await updateStudentProgress('student-nodedup', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      });

      // Assert: No duplicate entries
      const lesson1Occurrences = result.completedLessons.filter(
        (l) => l === 'course-1-lesson-1'
      ).length;
      expect(lesson1Occurrences).toBe(1);
    });

    it('should calculate percentage as 100 when all lessons are completed', async () => {
      // Arrange: 3 of 4 lessons completed
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-pct100',
        courseId: 'course-1',
        completedLessons: ['course-1-lesson-1', 'course-1-lesson-2', 'course-1-lesson-3'],
        currentModuleId: 'course-1-module-2',
        percentage: 75,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);

      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: [
          'course-1-lesson-1',
          'course-1-lesson-2',
          'course-1-lesson-3',
          'course-1-lesson-4',
        ],
        percentage: 100,
        status: 'completed',
        completedAt: new Date(),
      });

      // Act: Complete final lesson
      const result = await updateStudentProgress('student-pct100', 'course-1', {
        lessonId: 'course-1-lesson-4',
        status: 'completed',
      });

      // Assert: Course marked as completed
      expect(result.status).toBe('completed');
      expect(result.percentage).toBe(100);
    });

    it('should use explicit percentage when provided', async () => {
      // Arrange: Existing progress
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-explicit',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: null,
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);

      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: ['course-1-lesson-1'],
        percentage: 42,
        status: 'in_progress',
      });

      // Act: Update with explicit percentage
      const result = await updateStudentProgress('student-explicit', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
        percentage: 42,
      });

      // Assert: Explicit percentage used
      expect(result.percentage).toBe(42);
    });

    it('should log student activity on new lesson completion', async () => {
      // Arrange: Lesson not yet completed
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-activity',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: null,
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);
      mockPrismaStudentActivityCreate.mockResolvedValue({});
      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: ['course-1-lesson-1'],
        status: 'in_progress',
      });

      // Act: Complete lesson
      await updateStudentProgress('student-activity', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      });

      // Assert: Activity was logged
      expect(mockPrismaStudentActivityCreate).toHaveBeenCalled();
    });

    it('should not log activity when re-completing an already-completed lesson', async () => {
      // Arrange: Lesson already in completed list
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-dedup',
        courseId: 'course-1',
        completedLessons: ['course-1-lesson-1'],
        currentModuleId: 'course-1-module-1',
        percentage: 25,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);
      mockPrismaUpsert.mockResolvedValueOnce(existingProgress);

      // Act: Re-complete already completed lesson
      await updateStudentProgress('student-dedup', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      });

      // Assert: Activity was NOT logged again (de-duplication)
      expect(mockPrismaStudentActivityCreate).not.toHaveBeenCalled();
    });

    it('should fallback to mock store when database upsert fails', async () => {
      // Arrange: DB error during upsert
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-fallback-upsert',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: null,
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);
      mockPrismaUpsert.mockRejectedValueOnce(new Error('Upsert failed'));

      // Act: Update should still work via fallback
      const result = await updateStudentProgress('student-fallback-upsert', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      });

      // Assert: Fallback result returned
      expect(result).toBeDefined();
      expect(result.completedLessons).toContain('course-1-lesson-1');
    });

    it('should invalidate user progress cache after update', async () => {
      // Arrange: Existing progress
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-cache-invalidate',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: null,
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);
      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: ['course-1-lesson-1'],
        status: 'in_progress',
      });

      // Act: Update progress
      await updateStudentProgress('student-cache-invalidate', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      });

      // Assert: Cache invalidated for this student
      expect(mockInvalidateUserProgressCache).toHaveBeenCalledWith('student-cache-invalidate');
    });

    it('should set completedAt when course is completed', async () => {
      // Arrange: 3 of 4 lessons done, completing the last
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-completed-at',
        courseId: 'course-1',
        completedLessons: ['course-1-lesson-1', 'course-1-lesson-2', 'course-1-lesson-3'],
        currentModuleId: 'course-1-module-2',
        percentage: 75,
        status: 'in_progress',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);
      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: [
          'course-1-lesson-1',
          'course-1-lesson-2',
          'course-1-lesson-3',
          'course-1-lesson-4',
        ],
        percentage: 100,
        status: 'completed',
        completedAt: new Date(),
      });

      // Act: Complete last lesson
      const result = await updateStudentProgress('student-completed-at', 'course-1', {
        lessonId: 'course-1-lesson-4',
        status: 'completed',
      });

      // Assert: completedAt is set
      expect(result.completedAt).not.toBeNull();
    });

    it('should update currentModuleId when completing lesson in a module', async () => {
      // Arrange: Initial state
      const existingProgress = {
        id: 'progress-1',
        studentId: 'student-module-id',
        courseId: 'course-1',
        completedLessons: [],
        currentModuleId: null,
        percentage: 0,
        status: 'not_started',
        lastAccessedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(existingProgress);
      mockPrismaUpsert.mockResolvedValueOnce({
        ...existingProgress,
        completedLessons: ['course-1-lesson-1'],
        currentModuleId: 'course-1-module-1',
        status: 'in_progress',
      });

      // Act: Complete lesson in module 1
      const result = await updateStudentProgress('student-module-id', 'course-1', {
        lessonId: 'course-1-lesson-1',
        status: 'completed',
      });

      // Assert: Module tracking updated
      expect(result.currentModuleId).toBe('course-1-module-1');
    });
  });

  describe('Progress Status Calculations', () => {
    it('should calculate 0% for no completed lessons', async () => {
      // Arrange: Empty progress
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      // Act: Get initial progress
      const result = await getStudentProgress('student-zero', 'course-1');

      // Assert: Zero percentage
      expect(result.percentage).toBe(0);
      expect(result.status).toBe('not_started');
    });

    it('should set status as not_started when no lessons completed', async () => {
      // Arrange: Progress with no completions
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      // Act: Get progress
      const result = await getStudentProgress('fresh-student', 'course-2');

      // Assert: Status is not_started
      expect(result.status).toBe('not_started');
    });
  });
});
