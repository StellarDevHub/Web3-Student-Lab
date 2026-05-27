import { z } from 'zod';

export const searchQuerySchema = z.object({
  query: z.string().optional(),
  page: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => val > 0)
    .optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => val > 0 && val <= 100)
    .optional(),
  cursor: z.string().optional(),
  sort: z.string().optional(),
});

export const searchFiltersSchema = z.record(z.any());

export const searchParamsSchema = z
  .object({
    query: z.string().optional(),
    filters: z.record(z.any()).optional(),
    sort: z.string().optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  })
  .refine((data) => !(data.page && data.cursor), {
    message: "Cannot use both 'page' and 'cursor' pagination",
    path: ['page', 'cursor'],
  });

// Type exports
export type SearchQueryParams = z.infer<typeof searchQuerySchema>;
export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SearchParams = z.infer<typeof searchParamsSchema>;
