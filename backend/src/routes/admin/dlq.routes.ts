import { Router } from 'express';
import {
  getDLQMetrics,
  inspectDLQ,
  purgeDLQ,
  replayAllDLQJobs,
  replayDLQJob,
} from '../../services/dlq.service.js';

const router = Router();

// GET /admin/dlq - List / inspect DLQ jobs
router.get('/', async (req, res) => {
  try {
    const queue = typeof req.query.queue === 'string' ? req.query.queue : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const records = await inspectDLQ({ queue, limit });
    res.json({ records, count: records.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/dlq/metrics - Get DLQ metrics & alert status
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await getDLQMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/dlq/replay/:dlqId - Replay a specific job from DLQ
router.post('/replay/:dlqId', async (req, res) => {
  try {
    const { dlqId } = req.params;
    const result = await replayDLQJob(dlqId);
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    res.json({ message: 'Job replayed successfully', replayedJobId: result.replayedJobId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/dlq/replay - Replay all jobs (or jobs for specific queue)
router.post('/replay', async (req, res) => {
  try {
    const queue = typeof req.body.queue === 'string' ? req.body.queue : undefined;
    const result = await replayAllDLQJobs(queue);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/dlq/purge - Purge jobs from DLQ
router.post('/purge', async (req, res) => {
  try {
    const queue = typeof req.body.queue === 'string' ? req.body.queue : undefined;
    const result = await purgeDLQ(queue);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
