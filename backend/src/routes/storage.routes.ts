import { Request, Response, Router } from 'express';
import logger from '../utils/logger.js';
import { storageService } from '../services/storage/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    mode: process.env.DECENTRALIZED_STORAGE_PROVIDER || 'pinata',
  });
});

router.post('/pin-json', async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId, name, content, metadata, queued, referenceCount } = req.body;

    if (!resourceType || !resourceId || !name || content === undefined) {
      return res.status(400).json({ error: 'resourceType, resourceId, name, and content are required' });
    }

    if (queued) {
      const result = await storageService.queueJsonPin({
        resourceType,
        resourceId,
        name,
        kind: 'generic',
        content,
        metadata,
        referenceCount,
      });

      return res.status(202).json({
        success: true,
        queued: true,
        ...result,
      });
    }

    const result = await storageService.pinJsonNow({
      resourceType,
      resourceId,
      name,
      kind: 'generic',
      content,
      metadata,
      referenceCount,
    });

    return res.status(201).json({
      success: true,
      queued: false,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to pin JSON to decentralized storage:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pin JSON content',
    });
  }
});

router.post('/pin-file', async (req: Request, res: Response) => {
  try {
    const {
      resourceType,
      resourceId,
      name,
      contentBase64,
      mimeType,
      metadata,
      queued,
      referenceCount,
    } = req.body;

    if (!resourceType || !resourceId || !name || !contentBase64) {
      return res
        .status(400)
        .json({ error: 'resourceType, resourceId, name, and contentBase64 are required' });
    }

    if (queued) {
      const result = await storageService.queueFilePin({
        resourceType,
        resourceId,
        name,
        kind: 'generic',
        content: contentBase64,
        filename: name,
        mimeType: mimeType || 'application/octet-stream',
        metadata,
        referenceCount,
      });

      return res.status(202).json({
        success: true,
        queued: true,
        ...result,
      });
    }

    const result = await storageService.pinFileNow({
      resourceType,
      resourceId,
      name,
      kind: 'generic',
      content: Buffer.from(contentBase64, 'base64'),
      filename: name,
      mimeType: mimeType || 'application/octet-stream',
      metadata,
      referenceCount,
    });

    return res.status(201).json({
      success: true,
      queued: false,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to pin file to decentralized storage:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pin file content',
    });
  }
});

router.post('/gc', async (req: Request, res: Response) => {
  try {
    const retentionDays = Number(req.body?.retentionDays || process.env.STORAGE_GC_RETENTION_DAYS || '30');
    const dryRun = Boolean(req.body?.dryRun);

    const result = await storageService.queueGarbageCollection(retentionDays, dryRun);

    return res.status(202).json({
      success: true,
      queued: true,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to queue storage garbage collection:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to queue storage cleanup',
    });
  }
});

/**
 * GET /api/v1/storage/dlq
 * List dead-letter records for the storage pin queue.
 * Requires authentication.
 */
router.get('/dlq', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const limit = _req.query.limit ? Number(_req.query.limit) : undefined;
    const records = await storageService.getDlqRecords(limit !== undefined ? { limit } : {});

    res.json({
      status: 'success',
      data: { records, count: records.length },
    });
  } catch (error: any) {
    logger.error('Failed to list storage DLQ records:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to list DLQ records',
    });
  }
});

/**
 * GET /api/v1/storage/dlq/metrics
 * Get DLQ metrics for the storage pin queue.
 * Requires authentication.
 */
router.get('/dlq/metrics', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const metrics = await storageService.getDlqMetrics();

    res.json({
      status: 'success',
      data: metrics,
    });
  } catch (error: any) {
    logger.error('Failed to get storage DLQ metrics:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to get DLQ metrics',
    });
  }
});

/**
 * POST /api/v1/storage/dlq/replay/:dlqId
 * Replay a single dead-letter job back to the storage pin queue.
 * Requires authentication. Idempotent: re-enqueues the original payload.
 */
router.post('/dlq/replay/:dlqId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const dlqId = Array.isArray(req.params.dlqId) ? req.params.dlqId[0] : req.params.dlqId;
    if (!dlqId) {
      return res.status(400).json({ status: 'error', error: 'dlqId is required' });
    }
    const result = await storageService.replayDlqJob(dlqId);

    if (!result.success) {
      return res.status(404).json({
        status: 'error',
        error: result.error || `DLQ record not found: ${dlqId}`,
      });
    }

    res.json({
      status: 'success',
      data: {
        message: 'Job successfully replayed to storage pin queue',
        replayedJobId: result.replayedJobId,
      },
    });
  } catch (error: any) {
    logger.error('Failed to replay storage DLQ job:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to replay DLQ job',
    });
  }
});

/**
 * POST /api/v1/storage/dlq/replay
 * Replay all dead-letter jobs for the storage pin queue.
 * Requires authentication.
 */
router.post('/dlq/replay', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const result = await storageService.replayAllDlqJobs();

    res.json({
      status: 'success',
      data: {
        message: `Replayed ${result.replayedCount} storage DLQ job(s)`,
        replayedCount: result.replayedCount,
        errors: result.errors,
      },
    });
  } catch (error: any) {
    logger.error('Failed to replay all storage DLQ jobs:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to replay DLQ jobs',
    });
  }
});

/**
 * DELETE /api/v1/storage/dlq/purge
 * Purge all dead-letter records for the storage pin queue.
 * Requires authentication. Confirmation required via body { confirm: true }.
 */
router.delete('/dlq/purge', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { confirm } = req.body;

    if (!confirm) {
      return res.status(400).json({
        status: 'error',
        error: 'Purge operation must be confirmed with confirm: true',
      });
    }

    const result = await storageService.purgeDlq();

    res.json({
      status: 'success',
      data: {
        message: `Purged ${result.purgedCount} storage DLQ records`,
        purgedCount: result.purgedCount,
      },
    });
  } catch (error: any) {
    logger.error('Failed to purge storage DLQ records:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to purge DLQ records',
    });
  }
});

export default router;

