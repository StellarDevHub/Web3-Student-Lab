import { z } from 'zod';

/**
 * Validation schemas for the admin DLQ inspector (#1422 / BE-HARD-31).
 * Non-empty queue names are optional and default to "all queues" when omitted.
 */

const queueName = z.string().trim().min(1).max(128).optional();

export const dlqReplaySchema = z.object({
  queueName,
});

export const dlqPurgeSchema = z.object({
  queueName,
  confirm: z
    .boolean()
    .refine((value) => value === true, {
      message: 'Purge operation must be confirmed with confirm: true',
    }),
});

const dlqIds = z.array(z.string().trim().min(1).max(128)).min(1).max(500);

export const dlqBatchRetrySchema = z.object({
  dlqIds,
});

export const dlqBatchPurgeSchema = z.object({
  dlqIds,
  confirm: z
    .boolean()
    .refine((value) => value === true, {
      message: 'Purge operation must be confirmed with confirm: true',
    }),
});

export type DlqReplayInput = z.infer<typeof dlqReplaySchema>;
export type DlqPurgeInput = z.infer<typeof dlqPurgeSchema>;
export type DlqBatchRetryInput = z.infer<typeof dlqBatchRetrySchema>;
export type DlqBatchPurgeInput = z.infer<typeof dlqBatchPurgeSchema>;
