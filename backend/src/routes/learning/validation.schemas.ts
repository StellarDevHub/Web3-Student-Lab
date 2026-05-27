import { z } from 'zod';

export const courseParamsSchema = z.object({
  courseId: z.string().trim().min(1, 'Course ID is required'),
});

export const coursesQuerySchema = z.object({
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

export const progressUpdateSchema = z.object({
  lessonId: z.string().trim().min(1, 'Lesson ID is required'),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  percentage: z
    .number()
    .int('Percentage must be an integer')
    .min(0, 'Percentage must be at least 0')
    .max(100, 'Percentage must be at most 100')
    .optional(),
});
