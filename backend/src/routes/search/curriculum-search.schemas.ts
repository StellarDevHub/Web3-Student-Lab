import { z } from 'zod';

/**
 * Validation schema for `GET /api/v1/search`.
 *
 * `q` is the required keyword query. `type`, `difficulty` and `courseId` are
 * optional filters. `limit`/`offset` are coerced from query strings and bounded
 * to keep result sets fast.
 */
export const curriculumSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q (search keywords) is required'),
  type: z.enum(['course', 'module', 'lesson']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  courseId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  cursorRank: z.coerce.number().min(0).optional(),
  cursorTitle: z.string().trim().optional(),
  cursorId: z.string().trim().optional(),
});

export type CurriculumSearchQuery = z.infer<typeof curriculumSearchQuerySchema>;
