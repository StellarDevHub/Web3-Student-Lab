/**
 * Curriculum Service Unit Tests
 * 
 * Tests curriculum data retrieval, course listing, and filtering functionality.
 * Covers both database and fallback scenarios with comprehensive edge cases.
 */

import { jest } from '@jest/globals';
type Course = any;

// Mock dependencies before imports
const mockPrismaFindMany = jest.fn();
const mockPrismaFindUnique = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.unstable_mockModule('../src/db/index.ts', () => ({
  default: {
    course: {
      findMany: mockPrismaFindMany,
      findUnique: mockPrismaFindUnique,
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
  },
}));

let listCourses: any;
let getCourseCurriculum: any;

describe('Curriculum Service - Unit Tests', () => {
  beforeAll(async () => {
    const mod = await import('../src/routes/learning/learning.service.js');
    listCourses = mod.listCourses;
    getCourseCurriculum = mod.getCourseCurriculum;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  describe('listCourses()', () => {
    it('should return courses from cache when available', async () => {
      // Arrange: Mock cached data
      const cachedCourses = [
        {
          id: 'course-1',
          title: 'Test Course',
          description: 'Test Description',
          instructor: 'Test Instructor',
          credits: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          modules: [],
        },
      ];
      mockCacheGet.mockResolvedValueOnce(cachedCourses);

      // Act: Call service
      const result = await listCourses();

      // Assert: Cache was used, database not queried
      expect(result).toEqual(cachedCourses);
      expect(mockCacheGet).toHaveBeenCalledWith('courses:list');
      expect(mockPrismaFindMany).not.toHaveBeenCalled();
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache when cache misses', async () => {
      // Arrange: Mock database response
      const dbCourses: Course[] = [
        {
          id: 'course-1',
          title: 'Soroban Smart Contracts',
          description: 'Learn smart contracts',
          instructor: 'Web3 Lab',
          credits: 3,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      mockPrismaFindMany.mockResolvedValueOnce(dbCourses);

      // Act: Call service
      const result = await listCourses();

      // Assert: Database queried and result cached
      expect(mockPrismaFindMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'course-1',
        title: 'Soroban Smart Contracts',
      });
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should filter lessons by difficulty when specified', async () => {
      // Arrange: Mock database with course
      const dbCourses: Course[] = [
        {
          id: 'course-1',
          title: 'Test Course',
          description: 'Test',
          instructor: 'Instructor',
          credits: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrismaFindMany.mockResolvedValueOnce(dbCourses);

      // Act: Request only beginner lessons
      const result = await listCourses('beginner');

      // Assert: Modules contain only beginner lessons
      expect(result).toHaveLength(1);
      result[0].modules.forEach((module) => {
        module.lessons.forEach((lesson) => {
          expect(lesson.difficulty).toBe('beginner');
        });
      });
    });

    it('should fallback to mock data when database fails', async () => {
      // Arrange: Simulate database error
      mockPrismaFindMany.mockRejectedValueOnce(new Error('Database connection failed'));

      // Act: Call service
      const result = await listCourses();

      // Assert: Fallback data returned
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('modules');
    });

    it('should handle empty database result', async () => {
      // Arrange: Mock empty database
      mockPrismaFindMany.mockResolvedValueOnce([]);

      // Act: Call service
      const result = await listCourses();

      // Assert: Empty array returned
      expect(result).toEqual([]);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should filter out modules with no lessons after difficulty filter', async () => {
      // Arrange: Mock course data
      const dbCourses: Course[] = [
        {
          id: 'course-1',
          title: 'Mixed Difficulty Course',
          description: 'Has beginner and advanced',
          instructor: 'Instructor',
          credits: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrismaFindMany.mockResolvedValueOnce(dbCourses);

      // Act: Filter for advanced lessons only
      const result = await listCourses('advanced');

      // Assert: Only modules with advanced lessons remain
      result.forEach((course) => {
        course.modules.forEach((module) => {
          expect(module.lessons.length).toBeGreaterThan(0);
          module.lessons.forEach((lesson) => {
            expect(lesson.difficulty).toBe('advanced');
          });
        });
      });
    });
  });

  describe('getCourseCurriculum()', () => {
    it('should return course from cache when available', async () => {
      // Arrange: Mock cached course
      const cachedCourse = {
        id: 'course-1',
        title: 'Cached Course',
        description: 'From cache',
        instructor: 'Instructor',
        credits: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        modules: [],
      };
      mockCacheGet.mockResolvedValueOnce(cachedCourse);

      // Act: Get curriculum
      const result = await getCourseCurriculum('course-1');

      // Assert: Cached value returned
      expect(result).toEqual(cachedCourse);
      expect(mockCacheGet).toHaveBeenCalledWith('course:course-1:curriculum');
      expect(mockPrismaFindUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database when cache misses', async () => {
      // Arrange: Mock database response
      const dbCourse: Course = {
        id: 'course-1',
        title: 'Database Course',
        description: 'From DB',
        instructor: 'DB Instructor',
        credits: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(dbCourse);

      // Act: Get curriculum
      const result = await getCourseCurriculum('course-1');

      // Assert: Database queried and result includes modules
      expect(mockPrismaFindUnique).toHaveBeenCalledWith({
        where: { id: 'course-1' },
      });
      expect(result).toMatchObject({
        id: 'course-1',
        title: 'Database Course',
      });
      expect(result?.modules).toBeDefined();
    });

    it('should return null for non-existent course', async () => {
      // Arrange: Mock course not found in database or fallback
      mockPrismaFindUnique.mockResolvedValueOnce(null);

      // Act: Get non-existent course
      const result = await getCourseCurriculum('non-existent-course');

      // Assert: Null returned
      expect(result).toBeNull();
    });

    it('should filter curriculum by difficulty when provided', async () => {
      // Arrange: Mock course in database
      const dbCourse: Course = {
        id: 'course-1',
        title: 'Filterable Course',
        description: 'Has multiple difficulties',
        instructor: 'Instructor',
        credits: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(dbCourse);

      // Act: Get curriculum with difficulty filter
      const result = await getCourseCurriculum('course-1', 'intermediate');

      // Assert: Only intermediate lessons included
      expect(result).toBeDefined();
      result?.modules.forEach((module) => {
        module.lessons.forEach((lesson) => {
          expect(lesson.difficulty).toBe('intermediate');
        });
      });
    });

    it('should fallback to mock data when database fails but course exists in mock', async () => {
      // Arrange: Database error but course exists in COURSES
      mockPrismaFindUnique.mockRejectedValueOnce(new Error('DB Error'));

      // Act: Get course that exists in mock data
      const result = await getCourseCurriculum('course-1');

      // Assert: Mock data returned
      expect(result).toBeDefined();
      expect(result?.id).toBe('course-1');
      expect(result?.modules).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange: Simulate network timeout
      mockPrismaFindUnique.mockRejectedValueOnce(new Error('Connection timeout'));

      // Act: Attempt to get curriculum
      const result = await getCourseCurriculum('course-1');

      // Assert: No error thrown, fallback used
      expect(result).toBeDefined();
    });

    it('should cache the result after database fetch', async () => {
      // Arrange: Mock successful database fetch
      const dbCourse: Course = {
        id: 'course-2',
        title: 'To Be Cached',
        description: 'Test',
        instructor: 'Instructor',
        credits: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaFindUnique.mockResolvedValueOnce(dbCourse);

      // Act: Get curriculum
      await getCourseCurriculum('course-2');

      // Assert: Result was cached
      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent cache operations safely', async () => {
      // Arrange: Simulate concurrent requests
      mockPrismaFindMany.mockResolvedValue([]);

      // Act: Multiple concurrent calls
      const promises = Array(5)
        .fill(null)
        .map(() => listCourses());
      await Promise.all(promises);

      // Assert: No race conditions or errors
      expect(mockPrismaFindMany).toHaveBeenCalled();
    });

    it('should handle malformed database response', async () => {
      // Arrange: Mock incomplete database response
      mockPrismaFindMany.mockResolvedValueOnce([
        {
          id: 'incomplete-course',
          title: 'Incomplete',
          // Missing required fields
        } as any,
      ]);

      // Act & Assert: Should not throw
      await expect(listCourses()).resolves.toBeDefined();
    });

    it('should preserve course ordering from database', async () => {
      // Arrange: Mock multiple courses with different dates
      const courses: Course[] = [
        {
          id: 'course-old',
          title: 'Old Course',
          description: 'Old',
          instructor: 'Instructor',
          credits: 1,
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        },
        {
          id: 'course-new',
          title: 'New Course',
          description: 'New',
          instructor: 'Instructor',
          credits: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      mockPrismaFindMany.mockResolvedValueOnce(courses);

      // Act: List courses
      const result = await listCourses();

      // Assert: Ordering preserved
      expect(result[0].id).toBe('course-old');
      expect(result[1].id).toBe('course-new');
    });
  });
});
