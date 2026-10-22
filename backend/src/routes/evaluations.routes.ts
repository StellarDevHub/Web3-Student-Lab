import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware.js';
import { getQueueManager, QUEUE_NAMES, QueueRateLimitError } from '../queues/queueManager.js';
import { MAX_TEST_CASES } from '../services/wasmExecutionSandbox.js';
import { MAX_WASM_MODULE_BYTES } from '../utils/wasmValidator.js';
import { validateRequest } from '../utils/validation.js';
import { enqueueEvaluation, type EvaluationJobData } from '../workers/evaluationWorker.js';
import logger from '../utils/logger.js';

/**
 * Sandboxed contract evaluation (BE-010). Mounted at /api/v1/evaluations.
 *
 * Submissions are queued rather than run inline so a burst of students can
 * never exhaust the API process; progress is streamed through the
 * `exerciseStatusUpdated` GraphQL subscription and the final structured
 * result can be fetched from GET /:jobId.
 */

const router: ReturnType<typeof Router> = Router();

const MAX_BASE64_CHARS = Math.min(1_000_000, Math.ceil((MAX_WASM_MODULE_BYTES * 4) / 3) + 4);

const wasmValue = z.union([z.number().finite(), z.string().max(64)]);

export const evaluationSubmissionSchema = z.object({
  exerciseId: z.string().trim().min(1).max(128),
  // Bounded by the 1MB request body ceiling (≈730KB of bytecode); the
  // sandbox validator separately caps decoded modules at MAX_WASM_MODULE_BYTES.
  wasmBase64: z.string().min(1).max(MAX_BASE64_CHARS),
  tests: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        functionName: z.string().trim().min(1).max(128),
        args: z.array(wasmValue).max(16).optional(),
        expected: z.union([wasmValue, z.null()]).optional(),
      })
    )
    .min(1)
    .max(MAX_TEST_CASES),
});

/**
 * @route POST /api/v1/evaluations
 * @desc Queue a contract submission for sandboxed evaluation
 */
router.post('/', authenticate, validateRequest(evaluationSubmissionSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof evaluationSubmissionSchema>;
  try {
    const data: EvaluationJobData = {
      studentId: req.user!.id,
      exerciseId: body.exerciseId,
      wasmBase64: body.wasmBase64,
      tests: body.tests.map((t) => ({
        name: t.name,
        functionName: t.functionName,
        ...(t.args ? { args: t.args } : {}),
        ...(t.expected !== undefined ? { expected: t.expected } : {}),
      })),
    };
    const job = await enqueueEvaluation(data);
    res.status(202).json({ status: 'success', data: { jobId: job.id, state: 'queued' } });
  } catch (error) {
    if (error instanceof QueueRateLimitError) {
      res.setHeader('Retry-After', Math.ceil(error.retryAfterMs / 1000));
      res.status(429).json({ status: 'error', error: error.message });
      return;
    }
    logger.error('[evaluations] Failed to enqueue evaluation', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ status: 'error', error: 'Failed to queue evaluation' });
  }
});

/**
 * @route GET /api/v1/evaluations/:jobId
 * @desc Evaluation state and, once finished, the structured sandbox result
 */
router.get('/:jobId', authenticate, async (req: Request, res: Response) => {
  try {
    const job = await getQueueManager()
      .getQueue<EvaluationJobData>(QUEUE_NAMES.CONTRACT_EVALUATION)
      .getJob(String(req.params.jobId));

    // Respond 404 for other students' jobs too, so job ids can't be probed.
    if (!job || job.data.studentId !== req.user!.id) {
      res.status(404).json({ status: 'error', error: 'Evaluation not found' });
      return;
    }

    const state = await job.getState();
    res.json({
      status: 'success',
      data: {
        jobId: job.id,
        exerciseId: job.data.exerciseId,
        state,
        attemptsMade: job.attemptsMade,
        result: job.returnvalue ?? null,
        failedReason: state === 'failed' ? job.failedReason : null,
      },
    });
  } catch (error) {
    logger.error('[evaluations] Failed to read evaluation', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ status: 'error', error: 'Failed to read evaluation' });
  }
});

export default router;
