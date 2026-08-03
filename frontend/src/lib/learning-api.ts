import apiClient from './api-client';
import { apiRequestCache } from './api-cache';
import type { ProgressData } from './types/roadmap';
import { queueLessonProgressCompletion } from './offline-sync';

export interface CourseCurriculum {
  id: string;
  title: string;
  description: string;
  modules: Array<{
    id: string;
    title: string;
    description: string;
    difficulty: string;
    order: number;
  }>;
}

export interface LearningProgressResponse {
  studentId: string;
  courseId: string;
  completedLessons: string[];
  currentModuleId: string | null;
  percentage: number;
  status: 'not_started' | 'in_progress' | 'completed';
  lastAccessedAt: string | null;
  completedAt: string | null;
  /** Server-side `updatedAt` — used as the optimistic-concurrency token. */
  updatedAt?: string | null;
}

// Whether a response reflects the live database or the backend's
// explicitly labeled demo/degraded fallback (#911).
export type LearningDataSource = 'live' | 'demo';

export class ProgressUnavailableError extends Error {
  constructor(message = 'Progress could not be saved: learning service is temporarily unavailable') {
    super(message);
    this.name = 'ProgressUnavailableError';
  }
}

/**
 * Thrown when a progress save is rejected with HTTP 409 because another
 * session wrote newer progress first. Deterministic conflict behavior: the
 * server's state is authoritative and the UI reconciles by refetching.
 */
export class ProgressConflictError extends Error {
  readonly current: LearningProgressResponse | null;
  constructor(
    message = 'Progress was updated in another session',
    current: LearningProgressResponse | null = null
  ) {
    super(message);
    this.name = 'ProgressConflictError';
    this.current = current;
  }
}

const DEFAULT_CACHE_TTL_MS = 15_000;

function normalizeProgressResponse(
  data: unknown
): LearningProgressResponse | null {
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;

  if (
    typeof d.studentId === 'string' &&
    typeof d.courseId === 'string'
  ) {
    return {
      studentId: d.studentId as string,
      courseId: d.courseId as string,
      completedLessons: Array.isArray(d.completedLessons)
        ? (d.completedLessons as string[])
        : [],
      currentModuleId:
        typeof d.currentModuleId === 'string' ? d.currentModuleId : null,
      percentage:
        typeof d.percentage === 'number'
          ? d.percentage
          : typeof d.percentage === 'string'
            ? Number(d.percentage)
            : 0,
      status:
        ['not_started', 'in_progress', 'completed'].includes(
          d.status as string
        )
          ? (d.status as 'not_started' | 'in_progress' | 'completed')
          : 'not_started',
      lastAccessedAt:
        typeof d.lastAccessedAt === 'string' ? d.lastAccessedAt : null,
      completedAt:
        typeof d.completedAt === 'string' ? d.completedAt : null,
      updatedAt:
        typeof d.updatedAt === 'string' ? d.updatedAt : null,
    };
  }

  return null;
}

/**
 * The backend wraps progress in `{ progress, dataSource }`. Accept both that
 * wrapper and a bare progress object for robustness.
 */
function unwrapProgressBody(data: unknown): unknown {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d && typeof d.progress === 'object' && d.progress !== null) {
      return d.progress;
    }
  }
  return data;
}

export const learningAPI = {
  getCourses: async (): Promise<CourseCurriculum[]> => {
    return apiRequestCache.fetch(
      'learning:courses',
      async () => {
        const response = await apiClient.get('/learning/courses');
        return response.data as CourseCurriculum[];
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  getCourseCurriculum: async (
    courseId: string
  ): Promise<CourseCurriculum> => {
    return apiRequestCache.fetch(
      `learning:curriculum:${courseId}`,
      async () => {
        const response = await apiClient.get(
          `/learning/courses/${courseId}`
        );
        return response.data as CourseCurriculum;
      },
      { ttlMs: DEFAULT_CACHE_TTL_MS }
    );
  },

  getProgress: async (
    courseId: string
  ): Promise<LearningProgressResponse | null> => {
    try {
      const response = await apiClient.get(
        `/learning/courses/${courseId}/progress`
      );
      return normalizeProgressResponse(unwrapProgressBody(response.data));
    } catch {
      return null;
    }
  },

  /**
   * Fetches progress along with the `dataSource` flag so callers can
   * show a "showing demo data" indicator when the backend could not
   * reach the database (#911).
   */
  getProgressWithSource: async (
    courseId: string
  ): Promise<{ progress: LearningProgressResponse | null; dataSource: LearningDataSource }> => {
    try {
      const response = await apiClient.get(
        `/learning/courses/${courseId}/progress`
      );
      const data = response.data as { dataSource?: LearningDataSource };
      return {
        progress: normalizeProgressResponse(unwrapProgressBody(response.data)),
        dataSource: data?.dataSource ?? 'live',
      };
    } catch {
      return { progress: null, dataSource: 'demo' };
    }
  },

  /**
   * Updates progress. The payload is the learner's whole progress state plus
   * the `baseUpdatedAt` concurrency token the client last observed; the
   * backend applies it deterministically.
   *
   * Throws ProgressUnavailableError when the backend reports it could not
   * persist the update (HTTP 503) and ProgressConflictError when the write is
   * stale (HTTP 409) — callers must reconcile instead of assuming success.
   */
  updateProgress: async (
    courseId: string,
    data: Partial<{
      completedLessons: string[];
      currentModuleId: string | null;
      percentage: number;
      status: string;
      baseUpdatedAt: string | null;
    }>
  ): Promise<LearningProgressResponse | null> => {
    if (
      typeof window !== 'undefined' &&
      !navigator.onLine &&
      Array.isArray(data.completedLessons) &&
      data.completedLessons.length > 0
    ) {
      await queueLessonProgressCompletion({
        courseId,
        lessonId: data.completedLessons[data.completedLessons.length - 1]!,
        completedLessons: data.completedLessons,
        currentModuleId: data.currentModuleId ?? null,
        percentage: data.percentage ?? 0,
        status: data.status,
      });
    }

    try {
      const response = await apiClient.patch(
        `/learning/courses/${courseId}/progress`,
        data
      );
      apiRequestCache.invalidate(
        `learning:progress:${courseId}`
      );
      return normalizeProgressResponse(unwrapProgressBody(response.data));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { error?: string; progress?: unknown } } })
        ?.response?.status;
      if (status === 503) {
        const message = (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error;
        throw new ProgressUnavailableError(message);
      }
      if (status === 409) {
        const conflict = (err as { response?: { data?: { error?: string; progress?: unknown } } })?.response?.data;
        throw new ProgressConflictError(
          conflict?.error,
          normalizeProgressResponse(
            unwrapProgressBody(conflict?.progress ?? conflict)
          )
        );
      }
      return null;
    }
  },

  convertToProgressData(
    response: LearningProgressResponse
  ): ProgressData {
    return {
      completedLessons: response.completedLessons,
      currentModuleId: response.currentModuleId,
      percentage: response.percentage,
      status: response.status,
      lastAccessedAt: response.lastAccessedAt,
      completedAt: response.completedAt,
      updatedAt: response.updatedAt ?? null,
    };
  },

  getLocalProgressFallback(
    courseId: string
  ): ProgressData | null {
    if (typeof window === 'undefined') return null;

    try {
      const raw = localStorage.getItem(
        `roadmap_progress_${courseId}`
      );
      if (raw) {
        return JSON.parse(raw) as ProgressData;
      }
    } catch {
      return null;
    }
    return null;
  },

  saveLocalProgress(
    courseId: string,
    progress: ProgressData
  ): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(
        `roadmap_progress_${courseId}`,
        JSON.stringify(progress)
      );
    } catch {
      console.error('Failed to save progress locally');
    }
  },
};
