import prisma from '../../db/index.js';
import cacheService, { CACHE_KEYS } from '../../cache/CacheService.js';
import { invalidateUserProgressCache } from '../../cache/CacheInvalidation.js';
import { cacheTTL } from '../../config/redis.config.js';
import { COURSES, getCurriculumForCourse } from './curriculum.data.js';
import {
  CurriculumCourse,
  Module,
  Progress,
  ProgressStatus,
  ProgressUpdateInput,
} from './types.js';

// In-memory mock store for demo resilience
const mockProgressStore: Record<string, Progress> = {};

interface PrismaProgress {
  id: string;
  studentId: string;
  courseId: string;
  completedLessons?: string[];
  currentModuleId?: string;
  percentage?: number;
  status?: string;
  lastAccessedAt?: Date;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toProgress = (progress: unknown): Progress => {
  const p = progress as PrismaProgress;
  return {
    id: p.id,
    studentId: p.studentId,
    courseId: p.courseId ?? '',
    completedLessons: p.completedLessons || [],
    currentModuleId: p.currentModuleId ?? null,
    percentage: p.percentage ?? 0,
    status: (p.status as ProgressStatus) ?? 'not_started',
    lastAccessedAt: p.lastAccessedAt ?? null,
    completedAt: p.completedAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

const filterModulesByDifficulty = (modules: Module[], difficulty?: string): Module[] => {
  if (!difficulty) {
    return modules;
  }

  return modules
    .map((module) => ({
      ...module,
      lessons: module.lessons.filter((lesson) => lesson.difficulty === difficulty),
    }))
    .filter((module) => module.lessons.length > 0);
};

const countLessons = (modules: Module[]): number => {
  return modules.reduce((total, module) => total + module.lessons.length, 0);
};

const buildCourseStatus = (completedLessonCount: number, totalLessons: number): ProgressStatus => {
  if (completedLessonCount === 0) {
    return 'not_started';
  }

  if (totalLessons > 0 && completedLessonCount >= totalLessons) {
    return 'completed';
  }

  return 'in_progress';
};

const buildPercentage = (
  completedLessonCount: number,
  totalLessons: number,
  explicitPercentage?: number
): number => {
  if (typeof explicitPercentage === 'number') {
    return explicitPercentage;
  }

  if (totalLessons === 0) {
    return 0;
  }

  return Math.round((completedLessonCount / totalLessons) * 100);
};

/**
 * List all courses with optional difficulty filter.
 * Resilient: Falls back to hardcoded COURSES if database fails.
 */
export const listCourses = async (difficulty?: string): Promise<CurriculumCourse[]> => {
  const cacheKey = CACHE_KEYS.courses.list();
  const cached = await cacheService.get<CurriculumCourse[]>(cacheKey);
  if (cached) return cached;

  try {
    const courses = await prisma.course.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const result = courses.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      instructor: course.instructor,
      credits: course.credits,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      modules: filterModulesByDifficulty(getCurriculumForCourse(course.id), difficulty),
    }));

    await cacheService.set(cacheKey, result, cacheTTL.courses.list);
    return result;
  } catch (_error) {
    console.warn('Database error in listCourses, falling back to mock data');
    const now = new Date();
    return COURSES.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description || null,
      instructor: 'Web3 Student Lab',
      credits: 10,
      createdAt: now,
      updatedAt: now,
      modules: filterModulesByDifficulty(getCurriculumForCourse(course.id), difficulty),
    }));
  }
};

/**
 * Get curriculum for a specific course.
 * Resilient: Falls back to curriculumByCourseId if database fails.
 */
export const getCourseCurriculum = async (
  courseId: string,
  difficulty?: string
): Promise<CurriculumCourse | null> => {
  const cacheKey = CACHE_KEYS.courses.curriculum(courseId);
  const cached = await cacheService.get<CurriculumCourse>(cacheKey);
  if (cached) return cached;

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      // Check if course exists in our mock data
      const mockCourse = COURSES.find((c) => c.id === courseId);
      if (mockCourse) {
        const now = new Date();
        return {
          id: mockCourse.id,
          title: mockCourse.title,
          description: mockCourse.description || null,
          instructor: 'Web3 Student Lab',
          credits: 10,
          createdAt: now,
          updatedAt: now,
          modules: filterModulesByDifficulty(getCurriculumForCourse(courseId), difficulty),
        };
      }
      return null;
    }

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      instructor: course.instructor,
      credits: course.credits,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      modules: filterModulesByDifficulty(getCurriculumForCourse(course.id), difficulty),
    };
  } catch (_error) {
    console.warn('Database error in getCourseCurriculum, falling back to mock data');
    const mockCourse = COURSES.find((c) => c.id === courseId);
    if (!mockCourse) return null;

    const now = new Date();
    const result = {
      ...mockCourse,
      description: mockCourse.description || null,
      instructor: 'Web3 Student Lab',
      credits: 10,
      createdAt: now,
      updatedAt: now,
      modules: filterModulesByDifficulty(getCurriculumForCourse(courseId), difficulty),
    };

    await cacheService.set(cacheKey, result, cacheTTL.courses.curriculum);
    return result;
  }
};

/**
 * Get student progress for a course.
 * Resilient: Falls back to in-memory mockProgressStore if database fails.
 */
export const getStudentProgress = async (
  studentId: string,
  courseId: string
): Promise<Progress> => {
  const key = `${studentId}:${courseId}`;
  const cacheKey = `${CACHE_KEYS.user.progress(studentId)}:${courseId}`;
  
  const cached = await cacheService.get<Progress>(cacheKey);
  if (cached) return cached;

  try {
    const progress = await prisma.learningProgress.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
    });

    if (progress) {
      const p = toProgress(progress);
      mockProgressStore[key] = p; // Sync cache
      await cacheService.set(cacheKey, p, cacheTTL.user.progress);
      return p;
    }
  } catch (_error) {
    console.warn('Database error in getStudentProgress, using mock store');
  }

  // Fallback to mock store
  if (mockProgressStore[key]) {
    return mockProgressStore[key];
  }

  // Initial progress if nothing found anywhere
  const now = new Date();
  const initialProgress: Progress = {
    id: `progress-${studentId}-${courseId}`,
    studentId,
    courseId,
    completedLessons: [],
    currentModuleId: getCurriculumForCourse(courseId)[0]?.id ?? null,
    percentage: 0,
    status: 'not_started',
    lastAccessedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  mockProgressStore[key] = initialProgress;
  await cacheService.set(cacheKey, initialProgress, cacheTTL.user.progress);
  return initialProgress;
};

/**
 * Update student progress for a lesson.
 * Resilient: Falls back to in-memory mockProgressStore if database fails.
 */
export const updateStudentProgress = async (
  studentId: string,
  courseId: string,
  input: ProgressUpdateInput
): Promise<Progress> => {
  const modules = getCurriculumForCourse(courseId);
  const lesson = modules
    .flatMap((module) => module.lessons)
    .find((entry) => entry.id === input.lessonId);

  if (!lesson) {
    throw new Error('LESSON_NOT_FOUND');
  }

  const moduleForLesson = modules.find((module) =>
    module.lessons.some((entry) => entry.id === input.lessonId)
  );
  const totalLessons = countLessons(modules);
  const existingProgress = await getStudentProgress(studentId, courseId);

  const completedLessonSet = new Set(existingProgress.completedLessons);

  if (input.status === 'completed') {
    if (!completedLessonSet.has(input.lessonId)) {
      // Log individual lesson completion activity
      (prisma as any).studentActivity.create({
        data: {
          studentId,
          courseId,
          lessonId: input.lessonId,
          action: 'COMPLETED_LESSON',
        }
      }).catch((err: any) => console.warn('Failed to log student activity:', err));
    }
    completedLessonSet.add(input.lessonId);
  } else {
    completedLessonSet.delete(input.lessonId);
  }

  const completedLessons = Array.from(completedLessonSet);
  const percentage = buildPercentage(completedLessons.length, totalLessons, input.percentage);
  const status = buildCourseStatus(completedLessons.length, totalLessons);
  const completedAt = status === 'completed' ? new Date() : null;
  const now = new Date();

  // Update in-memory cache
  const updatedProgress: Progress = {
    ...existingProgress,
    completedLessons,
    currentModuleId: moduleForLesson?.id ?? existingProgress.currentModuleId,
    percentage,
    status,
    lastAccessedAt: now,
    completedAt,
    updatedAt: now,
  };

  const key = `${studentId}:${courseId}`;
  mockProgressStore[key] = updatedProgress;

  try {
    const progress = await prisma.learningProgress.upsert({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
      update: {
        completedLessons,
        currentModuleId: updatedProgress.currentModuleId,
        percentage,
        status,
        lastAccessedAt: now,
        completedAt,
      },
      create: {
        studentId,
        courseId,
        completedLessons,
        currentModuleId: updatedProgress.currentModuleId,
        percentage,
        status,
        lastAccessedAt: now,
        completedAt,
      },
    });

    await invalidateUserProgressCache(studentId);
    return toProgress(progress);
  } catch (_error) {
    console.warn('Database error in updateStudentProgress, updated in mock store only');
    await invalidateUserProgressCache(studentId);
    return updatedProgress;
  }
};
