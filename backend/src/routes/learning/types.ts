export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface Lesson {
  id: string;
  title: string;
  description: string;
  difficulty: LessonDifficulty;
  order: number;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: Lesson[];
}

export interface CurriculumCourse {
  id: string;
  title: string;
  description: string | null;
  instructor: string;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
  modules: Module[];
}

export interface Progress {
  id: string;
  studentId: string;
  courseId: string;
  completedLessons: string[];
  currentModuleId: string | null;
  percentage: number;
  status: ProgressStatus;
  lastAccessedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input accepted by PATCH /learning/courses/:courseId/progress.
 *
 * Two update styles are supported:
 *
 * 1. **Lesson-driven** (`lessonId` + `status`) — toggles a single lesson on
 *    top of the currently stored set. This is the legacy contract used by the
 *    `POST /learning/progress/:userId/complete` route and the offline sync
 *    flush, and it remains fully supported.
 *
 * 2. **Whole-state** (`completedLessons`, `currentModuleId`) — atomically
 *    replaces the learner's completed set and current module. This is the
 *    contract used by the roadmap UI, which tracks progress by its own node
 *    ids (journey levels) rather than curriculum lesson ids.
 *
 * Both styles may be combined in a single request; the lesson toggle is then
 * applied on top of the provided whole-state.
 *
 * `baseUpdatedAt` is an optimistic-concurrency token (the `updatedAt` value
 * the client last observed). When present, the write is rejected with a 409
 * conflict if the stored progress has since been modified by another client,
 * making concurrent/stale update behavior deterministic: the server is the
 * source of truth and the client reconciles by refetching.
 */
export interface ProgressUpdateInput {
  lessonId?: string;
  status?: ProgressStatus;
  percentage?: number;
  completedLessons?: string[];
  currentModuleId?: string | null;
  baseUpdatedAt?: string | null;
}
