import { z } from 'zod';

export const courseParamsSchema = z.object({
  courseId: z.string().trim().min(1, 'Course ID is required'),
});

export const coursesQuerySchema = z.object({
  // HTML forms send `?difficulty=` as an empty string; treat it as "no filter"
  // rather than rejecting the request.
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', '']).optional(),
});

export const progressUpdateSchema = z
  .object({
    lessonId: z.string().trim().min(1, 'Lesson ID is required').optional(),
    status: z
      .enum(['not_started', 'in_progress', 'completed'])
      .optional(),
    percentage: z
      .number()
      .int('Percentage must be an integer')
      .min(0, 'Percentage must be at least 0')
      .max(100, 'Percentage must be at most 100')
      .optional(),
    completedLessons: z
      .array(z.string().trim().min(1))
      .max(2000, 'Too many completed lessons')
      .optional(),
    currentModuleId: z
      .string()
      .trim()
      .min(1, 'Module ID must not be empty')
      .nullable()
      .optional(),
    baseUpdatedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      Boolean(value.lessonId) ||
      Array.isArray(value.completedLessons) ||
      value.currentModuleId != null,
    {
      message: 'Either lessonId, completedLessons, or currentModuleId is required',
      path: ['lessonId'],
    }
  );
