import { z } from 'zod';

// ---------------------------------------------------------------------------
// Request body / param schemas (Zod)
// ---------------------------------------------------------------------------

export const CreateStudentSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  did: z.string().optional(),
});

export const UpdateStudentSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  did: z.string().optional(),
});

export const StudentIdParamSchema = z.object({
  id: z.string().min(1, 'Student ID is required'),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

/** Body for POST /api/students */
export type CreateStudentBody = z.infer<typeof CreateStudentSchema>;

/** Body for PUT /api/students/:id */
export type UpdateStudentBody = z.infer<typeof UpdateStudentSchema>;

/** Route params for student-by-ID routes */
export type StudentIdParam = z.infer<typeof StudentIdParamSchema>;

// ---------------------------------------------------------------------------
// Audit detail shape logged alongside student mutations
// ---------------------------------------------------------------------------

export interface StudentAuditDetails {
  method: string;
  path: string;
  /** Sensitive fields (e.g. password) are never included here */
  fields?: string[];
}
