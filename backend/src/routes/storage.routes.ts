import { Request, Response, Router } from 'express';
import logger from '../utils/logger.js';
import { storageService } from '../services/storage/index.js';

const router = Router();

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

export default router;

