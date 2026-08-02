import { Request, Response, Router } from 'express';
import prisma from '../db/index.js';
import type {
    WebhookDestination,
    WebhookEventPayload,
} from '../services/webhooks/index.js';
import {
    canonicalizeWebhookPayload,
    enqueueWebhookDeliveries,
    verifyWebhookSignature,
} from '../services/webhooks/index.js';
import logger from '../utils/logger.js';

const router = Router();

const getIngestSecret = (): string => {
  const secret = process.env.WEBHOOK_INGEST_SECRET || process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    throw new Error('WEBHOOK_INGEST_SECRET or WEBHOOK_SIGNING_SECRET environment variable is required');
  }
  return secret;
};

const extractBody = (body: unknown): {
  event: WebhookEventPayload;
  destinations: WebhookDestination[];
  metadata?: Record<string, unknown>;
} => {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const candidate = body as {
    event?: WebhookEventPayload;
    destinations?: WebhookDestination[];
    metadata?: Record<string, unknown>;
  };

  if (!candidate.event || !candidate.destinations || candidate.destinations.length === 0) {
    throw new Error('Request body must include an event and at least one destination');
  }

  return {
    event: candidate.event,
    destinations: candidate.destinations,
    metadata: candidate.metadata,
  };
};

router.get('/health', async (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    mode: 'webhook-dispatch',
  });
});

router.post(['/ingest', '/dispatch'], async (req: Request, res: Response) => {
  try {
    const timestamp = req.header('x-webhook-timestamp') || '';
    const signature = req.header('x-webhook-signature') || '';
    const canonicalBody = canonicalizeWebhookPayload(req.body);
    const secret = getIngestSecret();

    if (!verifyWebhookSignature(canonicalBody, signature, secret, timestamp)) {
      logger.warn('Rejected webhook dispatch request with invalid signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const { event, destinations, metadata } = extractBody(req.body);
    const results = await enqueueWebhookDeliveries(event, destinations, metadata);

    return res.status(202).json({
      status: 'accepted',
      deliveries: results,
    });
  } catch (error) {
    logger.error('Failed to accept webhook dispatch request:', error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid webhook dispatch request',
    });
  }
});

// GET /subscriptions - Get all subscriptions
router.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    const subscriptions = await prisma.webhookSubscription.findMany();
    return res.json(subscriptions);
  } catch (error) {
    logger.error('Failed to get webhook subscriptions:', error);
    return res.status(500).json({ error: 'Failed to fetch webhook subscriptions' });
  }
});

// POST /subscriptions - Create a new subscription
router.post('/subscriptions', async (req: Request, res: Response) => {
  try {
    const { url, secret, events, active } = req.body;

    if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return res.status(400).json({ error: 'Invalid subscription URL' });
    }

    if (!events || !Array.isArray(events) || events.length === 0 || !events.every(e => typeof e === 'string')) {
      return res.status(400).json({ error: 'Events must be a non-empty array of strings' });
    }

    const subscription = await prisma.webhookSubscription.create({
      data: {
        url,
        secret: secret || null,
        events: events as any,
        active: active !== undefined ? Boolean(active) : true,
      },
    });

    return res.status(201).json(subscription);
  } catch (error: any) {
    logger.error('Failed to create webhook subscription:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Subscription for this URL already exists' });
    }
    return res.status(500).json({ error: 'Failed to create webhook subscription' });
  }
});

// DELETE /subscriptions/:id - Delete a subscription
router.delete('/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    const exists = await prisma.webhookSubscription.findUnique({
      where: { id },
    });
    if (!exists) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    await prisma.webhookSubscription.delete({
      where: { id },
    });
    return res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete webhook subscription:', error);
    return res.status(500).json({ error: 'Failed to delete webhook subscription' });
  }
});

export default router;
