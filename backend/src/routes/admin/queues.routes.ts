import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/admin.js';
import { validate } from '../../middleware/validation.js';
import { getQueueManager } from '../../queues/queueManager.js';
import logger from '../../utils/logger.js';

/**
 * Admin control plane for the BullMQ queue system (BE-006): queue depth
 * statistics plus inspect / replay / purge of dead-lettered jobs.
 * Mounted at /api/v1/admin/queues.
 */

const router: ReturnType<typeof Router> = Router();

router.use(authenticateToken as any);
router.use(requireAdmin as any);

const queueName = z.string().trim().min(1).max(128).optional();

export const queueDlqReplaySchema = z.object({ queueName });
export const queueDlqPurgeSchema = z.object({
  queueName,
  confirm: z.boolean().refine((value) => value === true, {
    message: 'Purge operation must be confirmed with confirm: true',
  }),
});

const parseInteger = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const fail = (res: Response, error: unknown, message: string) => {
  logger.error(`[admin/queues] ${message}`, { error: error instanceof Error ? error.message : String(error) });
  res.status(500).json({ status: 'error', error: message });
};

/**
 * @route GET /api/v1/admin/queues/stats
 * @desc Job counts for every managed queue and the dead-letter queue
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const queues = await getQueueManager().getStats();
    res.json({ status: 'success', data: { queues } });
  } catch (error) {
    fail(res, error, 'Failed to retrieve queue statistics');
  }
});

/**
 * @route GET /api/v1/admin/queues/dlq
 * @desc List dead-lettered jobs, optionally filtered by source queue
 */
router.get('/dlq', async (req: Request, res: Response) => {
  try {
    const sourceQueue = typeof req.query.queue === 'string' && req.query.queue ? req.query.queue : undefined;
    const offset = parseInteger(req.query.offset);
    const limit = parseInteger(req.query.limit);
    const result = await getQueueManager().dlq.list({
      ...(sourceQueue ? { sourceQueue } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    res.json({ status: 'success', data: { ...result, count: result.entries.length } });
  } catch (error) {
    fail(res, error, 'Failed to inspect dead-letter queue');
  }
});

/**
 * @route POST /api/v1/admin/queues/dlq/replay
 * @desc Replay every dead-lettered job (optionally only those from one queue)
 */
router.post('/dlq/replay', validate(queueDlqReplaySchema), async (req: Request, res: Response) => {
  try {
    const { queueName: source } = req.body as z.infer<typeof queueDlqReplaySchema>;
    const result = await getQueueManager().dlq.replayAll(source);
    res.json({ status: 'success', data: { ...result, queueName: source ?? 'all' } });
  } catch (error) {
    fail(res, error, 'Failed to replay dead-lettered jobs');
  }
});

/**
 * @route POST /api/v1/admin/queues/dlq/purge
 * @desc Permanently delete dead-lettered jobs; requires { confirm: true }
 */
router.post('/dlq/purge', validate(queueDlqPurgeSchema), async (req: Request, res: Response) => {
  try {
    const { queueName: source } = req.body as z.infer<typeof queueDlqPurgeSchema>;
    const result = await getQueueManager().dlq.purgeAll(source);
    logger.warn('[admin/queues] DLQ purged', { by: (req as any).user?.id, queueName: source ?? 'all', ...result });
    res.json({ status: 'success', data: { ...result, queueName: source ?? 'all' } });
  } catch (error) {
    fail(res, error, 'Failed to purge dead-letter queue');
  }
});

/**
 * @route GET /api/v1/admin/queues/dlq/:id
 * @desc Inspect a single dead-lettered job including its failure reason and stack
 */
router.get('/dlq/:id', async (req: Request, res: Response) => {
  try {
    const entry = await getQueueManager().dlq.get(String(req.params.id));
    if (!entry) {
      res.status(404).json({ status: 'error', error: 'Dead-lettered job not found' });
      return;
    }
    res.json({ status: 'success', data: { entry } });
  } catch (error) {
    fail(res, error, 'Failed to retrieve dead-lettered job');
  }
});

/**
 * @route POST /api/v1/admin/queues/dlq/:id/replay
 * @desc Re-enqueue one dead-lettered job on its source queue with a fresh retry budget
 */
router.post('/dlq/:id/replay', async (req: Request, res: Response) => {
  try {
    const result = await getQueueManager().dlq.replay(String(req.params.id));
    if (!result) {
      res.status(404).json({ status: 'error', error: 'Dead-lettered job not found' });
      return;
    }
    res.json({ status: 'success', data: result });
  } catch (error) {
    fail(res, error, 'Failed to replay dead-lettered job');
  }
});

/**
 * @route DELETE /api/v1/admin/queues/dlq/:id
 * @desc Permanently delete one dead-lettered job
 */
router.delete('/dlq/:id', async (req: Request, res: Response) => {
  try {
    const removed = await getQueueManager().dlq.purge(String(req.params.id));
    if (!removed) {
      res.status(404).json({ status: 'error', error: 'Dead-lettered job not found' });
      return;
    }
    res.json({ status: 'success', data: { id: req.params.id, purged: true } });
  } catch (error) {
    fail(res, error, 'Failed to purge dead-lettered job');
  }
});

export default router;
