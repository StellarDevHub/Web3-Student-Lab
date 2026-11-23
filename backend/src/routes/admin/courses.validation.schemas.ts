import { z } from 'zod';

export const CreateCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters long')
    .max(200, 'Title cannot exceed 200 characters'),
  description: z
    .string()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional()
    .default(''),
  instructor: z
    .string()
    .trim()
    .min(2, 'Instructor must be at least 2 characters long')
    .max(100, 'Instructor cannot exceed 100 characters'),
  credits: z
    .number()
    .int('Credits must be an integer')
    .min(1, 'Credits must be at least 1')
    .max(12, 'Credits cannot exceed 12')
    .default(3),
  workspaceId: z.string().trim().min(1).optional(),
});

export const UpdateCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters long')
    .max(200, 'Title cannot exceed 200 characters')
    .optional(),
  description: z
    .string()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional(),
  instructor: z
    .string()
    .trim()
    .min(2, 'Instructor must be at least 2 characters long')
    .max(100, 'Instructor cannot exceed 100 characters')
    .optional(),
  credits: z
    .number()
    .int('Credits must be an integer')
    .min(1, 'Credits must be at least 1')
    .max(12, 'Credits cannot exceed 12')
    .optional(),
});

export const CourseIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Course ID is required'),
});

export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;
export type UpdateCourseInput = z.infer<typeof UpdateCourseSchema>;
