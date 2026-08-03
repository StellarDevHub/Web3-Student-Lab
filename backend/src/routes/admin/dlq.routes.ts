import { Router, Request, Response } from 'express';
import {
  inspectDLQ,
  getDLQMetrics,
  replayDLQJob,
  replayAllDLQJobs,
  purgeDLQ,
  DLQJobRecord
} from '../../services/dlq.service.js';
import logger from '../../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @route GET /api/v1/admin/dlq/metrics
 * @desc Get DLQ metrics including total count and per-queue breakdown
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = await getDLQMetrics();
    
    res.json({
      status: 'success',
      data: { metrics }
    });
  } catch (error: any) {
    logger.error('Failed to get DLQ metrics:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve DLQ metrics'
    });
  }
});

/**
 * @route GET /api/v1/admin/dlq/jobs
 * @desc Inspect jobs in the DLQ with optional filtering
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { queue, limit } = req.query;
    
    const filter: { queue?: string; limit?: number } = {};
    if (queue && typeof queue === 'string') {
      filter.queue = queue;
    }
    if (limit && typeof limit === 'string') {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        filter.limit = parsedLimit;
      }
    }

    const jobs = await inspectDLQ(filter);
    
    res.json({
      status: 'success',
      data: { 
        jobs,
        count: jobs.length,
        filter 
      }
    });
  } catch (error: any) {
    logger.error('Failed to inspect DLQ jobs:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to inspect DLQ jobs'
    });
  }
});

/**
 * @route GET /api/v1/admin/dlq/jobs/:dlqId
 * @desc Get a specific DLQ job by ID
 */
router.get('/jobs/:dlqId', async (req: Request, res: Response) => {
  try {
    const { dlqId } = req.params;
    const jobs = await inspectDLQ();
    const job = jobs.find(j => j.dlqId === dlqId);
    
    if (!job) {
      res.status(404).json({
        status: 'error',
        error: `DLQ job not found: ${dlqId}`
      });
      return;
    }

    res.json({
      status: 'success',
      data: { job }
    });
  } catch (error: any) {
    logger.error(`Failed to get DLQ job ${req.params.dlqId}:`, error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve DLQ job'
    });
  }
});

/**
 * @route POST /api/v1/admin/dlq/jobs/:dlqId/replay
 * @desc Replay a single DLQ job back to its original queue
 */
router.post('/jobs/:dlqId/replay', async (req: Request, res: Response) => {
  try {
    const { dlqId } = req.params;
    const result = await replayDLQJob(dlqId as string);
    
    if (!result.success) {
      res.status(400).json({
        status: 'error',
        error: result.error || 'Failed to replay DLQ job'
      });
      return;
    }

    res.json({
      status: 'success',
      data: { 
        message: 'Job successfully replayed',
        replayedJobId: result.replayedJobId 
      }
    });
  } catch (error: any) {
    logger.error(`Failed to replay DLQ job ${req.params.dlqId}:`, error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to replay DLQ job'
    });
  }
});

/**
 * @route POST /api/v1/admin/dlq/replay
 * @desc Replay all DLQ jobs or all jobs for a specific queue
 */
router.post('/replay', async (req: Request, res: Response) => {
  try {
    const { queueName } = req.body;
    
    const result = await replayAllDLQJobs(queueName);
    
    res.json({
      status: 'success',
      data: { 
        message: `Replayed ${result.replayedCount} jobs`,
        replayedCount: result.replayedCount,
        errors: result.errors,
        queueName: queueName || 'all'
      }
    });
  } catch (error: any) {
    logger.error('Failed to replay DLQ jobs:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to replay DLQ jobs'
    });
  }
});

/**
 * @route DELETE /api/v1/admin/dlq/purge
 * @desc Purge DLQ jobs from storage
 */
router.delete('/purge', async (req: Request, res: Response) => {
  try {
    const { queueName, confirm } = req.body;
    
    if (!confirm) {
      res.status(400).json({
        status: 'error',
        error: 'Purge operation must be confirmed with confirm: true'
      });
      return;
    }
    
    const result = await purgeDLQ(queueName);
    
    res.json({
      status: 'success',
      data: { 
        message: `Purged ${result.purgedCount} jobs`,
        purgedCount: result.purgedCount,
        queueName: queueName || 'all'
      }
    });
  } catch (error: any) {
    logger.error('Failed to purge DLQ jobs:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to purge DLQ jobs'
    });
  }
});

/**
 * @route GET /api/v1/admin/dlq/health
 * @desc Get DLQ health status and alerting information
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const metrics = await getDLQMetrics();
    
    const health = {
      status: metrics.isAlerting ? 'alerting' : 'healthy',
      totalJobs: metrics.totalCount,
      threshold: metrics.threshold,
      isAlerting: metrics.isAlerting,
      queueBreakdown: metrics.perQueue,
      timestamp: new Date().toISOString()
    };
    
    res.json({
      status: 'success',
      data: { health }
    });
  } catch (error: any) {
    logger.error('Failed to get DLQ health:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve DLQ health status'
    });
  }
});

/**
 * @route GET /api/v1/admin/dlq/queues
 * @desc Get list of available queues in the DLQ system
 */
router.get('/queues', async (_req: Request, res: Response) => {
  try {
    const jobs = await inspectDLQ();
    const queueNames = [...new Set(jobs.map(job => job.originalQueue))];
    
    const queueStats = queueNames.map(queueName => {
      const queueJobs = jobs.filter(job => job.originalQueue === queueName);
      return {
        name: queueName,
        jobCount: queueJobs.length,
        oldestJob: queueJobs.length > 0 ? 
          queueJobs.reduce((oldest, job) => 
            new Date(job.failedAt) < new Date(oldest.failedAt) ? job : oldest
          ).failedAt : null,
        newestJob: queueJobs.length > 0 ?
          queueJobs.reduce((newest, job) => 
            new Date(job.failedAt) > new Date(newest.failedAt) ? job : newest
          ).failedAt : null
      };
    });
    
    res.json({
      status: 'success',
      data: { 
        queues: queueStats,
        totalQueues: queueNames.length,
        totalJobs: jobs.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to get DLQ queues:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve DLQ queue information'
    });
  }
});

export default router;