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

export interface ProgressUpdateInput {
  lessonId: string;
  status: ProgressStatus;
  percentage?: number;
}
