import { Request, Response, Router } from 'express';
import { verifySignature } from '../utils/signature.js';
import { enqueueWebhook } from '../services/queue.service.js';
import logger from '../utils/logger.js';

const router = Router();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webhook-secret';

router.post('/ingest', async (req: Request, res: Response) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const payload = JSON.stringify(req.body);

  if (!signature || !verifySignature(payload, signature, WEBHOOK_SECRET)) {
    logger.warn('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    // Immediately enqueue and return 200 OK
    await enqueueWebhook(req.body);
    res.status(200).json({ status: 'accepted' });
  } catch (error) {
    logger.error('Failed to enqueue webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
