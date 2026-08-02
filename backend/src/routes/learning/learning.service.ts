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
import { enqueueWebhookDeliveries } from '../../services/webhooks/index.js';
import logger from '../../utils/logger.js';

/**
 * Result wrapper distinguishing authoritative database-backed data from
 * the hardcoded demo/degraded-mode fallback (#911). Consumers MUST
 * branch on `dataSource` instead of assuming a successful call means
 * live data.
 */
export type DataSource = 'live' | 'demo';
export interface WithDataSource<T> {
  data: T;
  dataSource: DataSource;
}

/**
 * Thrown when student progress could not be persisted to the database.
 * Callers must NOT treat this as a successful save — there is no
 * mock/demo write path for learner progress, per #911.
 */
export class ProgressPersistenceError extends Error {
  constructor(message = 'Progress could not be saved: learning service is temporarily unavailable') {
    super(message);
    this.name = 'ProgressPersistenceError';
  }
}

// In-memory store used ONLY as a read-through cache in front of the
// database for getStudentProgress, and as ephemeral local state while a
// write is in flight. It is never treated as an authoritative record of
// progress — see updateStudentProgress, which fails explicitly instead
// of "succeeding" against this store when the database is unreachable.
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
 *
 * #911: On a database outage this NO LONGER silently returns the
 * hardcoded demo catalog as if it were authoritative. It returns an
 * explicitly labeled `dataSource: 'demo'` result and logs the failure,
 * so callers/clients can distinguish live data from a degraded demo
 * state and show appropriate guidance.
 */
export const listCourses = async (
  difficulty?: string
): Promise<WithDataSource<CurriculumCourse[]>> => {
  const cacheKey = CACHE_KEYS.courses.list();
  const cached = await cacheService.get<CurriculumCourse[]>(cacheKey);
  if (cached) return { data: cached, dataSource: 'live' };

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
    return { data: result, dataSource: 'live' };
  } catch (error) {
    logger.error('Database unavailable in listCourses; returning demo data', { error });
    const now = new Date();
    const demoData = COURSES.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description || null,
      instructor: 'Web3 Student Lab',
      credits: 10,
      createdAt: now,
      updatedAt: now,
      modules: filterModulesByDifficulty(getCurriculumForCourse(course.id), difficulty),
    }));
    return { data: demoData, dataSource: 'demo' };
  }
};

/**
 * Get curriculum for a specific course.
 *
 * #911: Same explicit-degraded-state contract as listCourses — a
 * database failure returns demo data tagged `dataSource: 'demo'`
 * instead of masquerading as live data.
 */
export const getCourseCurriculum = async (
  courseId: string,
  difficulty?: string
): Promise<WithDataSource<CurriculumCourse | null>> => {
  const cacheKey = CACHE_KEYS.courses.curriculum(courseId);
  const cached = await cacheService.get<CurriculumCourse>(cacheKey);
  if (cached) return { data: cached, dataSource: 'live' };

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return { data: null, dataSource: 'live' };
    }

    const result = {
      id: course.id,
      title: course.title,
      description: course.description,
      instructor: course.instructor,
      credits: course.credits,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      modules: filterModulesByDifficulty(getCurriculumForCourse(course.id), difficulty),
    };

    await cacheService.set(cacheKey, result, cacheTTL.courses.curriculum);
    return { data: result, dataSource: 'live' };
  } catch (error) {
    logger.error(`Database unavailable in getCourseCurriculum(${courseId}); returning demo data`, {
      error,
    });
    const mockCourse = COURSES.find((c) => c.id === courseId);
    if (!mockCourse) {
      return { data: null, dataSource: 'demo' };
    }

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

    return { data: result, dataSource: 'demo' };
  }
};

/**
 * Get student progress for a course.
 *
 * #911: If the database is unreachable, this returns the last known
 * local snapshot (or a fresh "not started" placeholder) tagged
 * `dataSource: 'demo'` — it is a read-side degraded view, not an
 * authoritative record, and is never used as the basis for persisting
 * further writes (see updateStudentProgress).
 */
export const getStudentProgress = async (
  studentId: string,
  courseId: string
): Promise<WithDataSource<Progress>> => {
  const key = `${studentId}:${courseId}`;
  const cacheKey = `${CACHE_KEYS.user.progress(studentId)}:${courseId}`;

  const cached = await cacheService.get<Progress>(cacheKey);
  if (cached) return { data: cached, dataSource: 'live' };

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
      mockProgressStore[key] = p; // Sync local read-through cache
      await cacheService.set(cacheKey, p, cacheTTL.user.progress);
      return { data: p, dataSource: 'live' };
    }
  } catch (error) {
    logger.error('Database unavailable in getStudentProgress; returning degraded view', {
      studentId,
      courseId,
      error,
    });

    if (mockProgressStore[key]) {
      return { data: mockProgressStore[key], dataSource: 'demo' };
    }

    const now = new Date();
    const placeholder: Progress = {
      id: `progress-${studentId}-${courseId}`,
      studentId,
      courseId,
      completedLessons: [],
      currentModuleId: getCurriculumForCourse(courseId)[0]?.id ?? null,
      percentage: 0,
      status: 'not_started',
      lastAccessedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return { data: placeholder, dataSource: 'demo' };
  }

  // Database reachable but no progress row exists yet — this is
  // authoritative "not started" state, not demo data.
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
  return { data: initialProgress, dataSource: 'live' };
};

/**
 * Update student progress for a lesson.
 *
 * #911: Progress is only ever considered saved if it was actually
 * persisted to the database. If the database is unreachable, this
 * throws ProgressPersistenceError instead of silently "succeeding"
 * against the in-memory mock store — there is no mock-only write path
 * for learner progress, so a learner can never be told their progress
 * was saved when it wasn't.
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
  const existingProgressResult = await getStudentProgress(studentId, courseId);
  const existingProgress = existingProgressResult.data;

  const completedLessonSet = new Set(existingProgress.completedLessons);

  if (input.status === 'completed') {
    if (!completedLessonSet.has(input.lessonId)) {
      // Log individual lesson completion activity
      await (prisma as any).studentActivity
        .create({
          data: {
            studentId,
            courseId,
            lessonId: input.lessonId,
            action: 'COMPLETED_LESSON',
          },
        })
        .catch((err: any) => console.warn('Failed to log student activity:', err));

      // Trigger lesson.completed webhook
      try {
        const student = await prisma.student.findUnique({
          where: { id: studentId },
        });

        const subscriptions = await prisma.webhookSubscription.findMany({
          where: { active: true },
        });

        const lessonCompletedSubscriptions = subscriptions.filter((sub) => {
          try {
            const events = typeof sub.events === 'string' ? JSON.parse(sub.events) : (sub.events as string[]);
            return Array.isArray(events) && events.includes('lesson.completed');
          } catch {
            return false;
          }
        });

        if (lessonCompletedSubscriptions.length > 0) {
          const payload = {
            id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            type: 'lesson.completed',
            occurredAt: new Date().toISOString(),
            source: 'student-portal',
            data: {
              studentId,
              studentEmail: student?.email || '',
              studentName: student ? `${student.firstName} ${student.lastName}` : '',
              courseId,
              lessonId: input.lessonId,
              completedAt: new Date().toISOString(),
            },
          };

          const destinations = lessonCompletedSubscriptions.map((sub) => ({
            id: sub.id,
            url: sub.url,
            secret: sub.secret || undefined,
          }));

          await enqueueWebhookDeliveries(payload as any, destinations).catch((err) =>
            console.error('Failed to enqueue lesson.completed webhooks:', err)
          );
        }
      } catch (err) {
        console.error('Error during lesson completion webhook trigger:', err);
      }
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

    const key = `${studentId}:${courseId}`;
    mockProgressStore[key] = updatedProgress; // keep read-through cache warm

    await invalidateUserProgressCache(studentId);
    return toProgress(progress);
  } catch (error) {
    logger.error('Database unavailable in updateStudentProgress; refusing to fake-save progress', {
      studentId,
      courseId,
      lessonId: input.lessonId,
      error,
    });
    // Do NOT write to mockProgressStore here and do NOT return as if
    // the save succeeded — a learner's progress must never be recorded
    // against demo/mock state (#911 acceptance criteria).
    throw new ProgressPersistenceError();
  }
};
