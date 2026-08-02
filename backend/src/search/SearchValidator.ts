import { z } from 'zod';

export interface SearchOptions {
  query?: string;
  filters?: Record<string, any>;
  sort?: string;
  page?: number;
  limit?: number;
  cursor?: string;
}

const searchOptionsSchema = z
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

export class SearchValidator {
  validateSearchOptions(options: SearchOptions): void {
    try {
      searchOptionsSchema.parse(options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid search options: ${error.errors.map((e) => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  validateSortField(sort: string, allowedFields: string[]): void {
    const [field] = sort.split(':');
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid sort field: ${field}. Allowed fields: ${allowedFields.join(', ')}`);
    }
  }

  validateFilterFields(filters: Record<string, any>, allowedFields: string[]): void {
    for (const field of Object.keys(filters)) {
      if (!allowedFields.includes(field)) {
        throw new Error(
          `Invalid filter field: ${field}. Allowed fields: ${allowedFields.join(', ')}`
        );
      }
    }
  }

  sanitizeQuery(query: string): string {
    // Remove potentially harmful characters and limit length
    return query
      .replace(/[<>'"&]/g, '')
      .trim()
      .substring(0, 1000);
  }
}
