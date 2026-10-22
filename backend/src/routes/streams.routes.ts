/**
 * Payment stream endpoints (Issue BE-018).
 *
 *   POST /api/v1/streams/balances           -> bulk claimable balances (<= 500 streams)
 *   GET  /api/v1/streams/events             -> SSE: cliff reached / stream completed
 *   POST /api/v1/streams/events             -> ingest indexed events (admin backfill)
 *   GET  /api/v1/streams/address/:address   -> streams where address is sender/recipient
 *   GET  /api/v1/streams/:streamId          -> stream state + balance
 *   GET  /api/v1/streams/:streamId/balance  -> balance at `?at=<unix seconds>`
 */

import { Router, type Request, type Response } from 'express';
import { performance } from 'perf_hooks';
import { z } from 'zod';
import {
  streamEventSubscriber,
  type NormalizedStreamEvent,
} from '../indexer/streamEventSubscriber.js';
import { requireAdmin } from '../middleware/admin.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  computeBalance,
  nowInSeconds,
  streamCalculatorService,
  type StreamMilestoneEvent,
  type StreamRecord,
} from '../services/streamCalculatorService.js';
import { SseSessionManager } from '../sse/SseSessionManager.js';

const router: Router = Router();

export const MAX_BULK_STREAMS = 500;

const streamSse = new SseSessionManager();

const amountString = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]);

const bulkSchema = z.object({
  streamIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_STREAMS),
  at: z.number().int().positive().optional(),
});

const ingestEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('created'),
    eventId: z.string().min(1),
    streamId: z.string().min(1),
    sender: z.string().min(1),
    recipient: z.string().min(1),
    asset: z.string().optional(),
    depositAmount: amountString,
    startTime: z.number().int().nonnegative(),
    cliffTime: z.number().int().nonnegative().optional(),
    endTime: z.number().int().positive(),
    cancelable: z.boolean().optional(),
    timestamp: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('withdrawn'),
    eventId: z.string().min(1),
    streamId: z.string().min(1),
    amount: amountString,
    to: z.string().optional(),
    timestamp: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('canceled'),
    eventId: z.string().min(1),
    streamId: z.string().min(1),
    senderAmount: amountString.optional(),
    recipientAmount: amountString.optional(),
    timestamp: z.number().int().positive().optional(),
  }),
]);

const ingestSchema = z.object({ events: z.array(ingestEventSchema).min(1).max(1000) });

function serializeStream(stream: StreamRecord) {
  return {
    ...stream,
    depositAmount: stream.depositAmount.toString(),
    withdrawnAmount: stream.withdrawnAmount.toString(),
    ...(stream.refundedAmount !== undefined ? { refundedAmount: stream.refundedAmount.toString() } : {}),
  };
}

function parseAt(value: unknown): number | undefined {
  const at = Number(value);
  return Number.isInteger(at) && at > 0 ? at : undefined;
}

function toNormalizedEvent(input: z.infer<typeof ingestEventSchema>): NormalizedStreamEvent {
  const timestamp = input.timestamp ?? nowInSeconds();
  switch (input.type) {
    case 'created':
      return {
        type: 'created',
        eventId: input.eventId,
        streamId: input.streamId,
        sender: input.sender,
        recipient: input.recipient,
        depositAmount: BigInt(input.depositAmount),
        startTime: input.startTime,
        cliffTime: input.cliffTime ?? input.startTime,
        endTime: input.endTime,
        timestamp,
        ...(input.asset ? { asset: input.asset } : {}),
        ...(input.cancelable !== undefined ? { cancelable: input.cancelable } : {}),
      };
    case 'withdrawn':
      return {
        type: 'withdrawn',
        eventId: input.eventId,
        streamId: input.streamId,
        amount: BigInt(input.amount),
        timestamp,
        ...(input.to ? { to: input.to } : {}),
      };
    case 'canceled':
      return {
        type: 'canceled',
        eventId: input.eventId,
        streamId: input.streamId,
        timestamp,
        ...(input.senderAmount !== undefined ? { senderAmount: BigInt(input.senderAmount) } : {}),
        ...(input.recipientAmount !== undefined ? { recipientAmount: BigInt(input.recipientAmount) } : {}),
      };
  }
}

// Relay milestones to subscribers of the stream, of either party, or of all streams.
streamCalculatorService.on('milestone', (event: StreamMilestoneEvent) => {
  const name = `stream.${event.milestone}`;
  const eventId = `${event.streamId}:${event.milestone}`;
  for (const key of new Set([
    `stream:${event.streamId}`,
    `address:${event.sender}`,
    `address:${event.recipient}`,
    'all',
  ])) {
    streamSse.emitToUser(key, name, event, eventId);
  }
});

if (process.env.NODE_ENV !== 'test') {
  streamCalculatorService.startMilestoneTicker();
  streamEventSubscriber.start();
}

router.post('/balances', (req: Request, res: Response) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  }
  const started = performance.now();
  const { balances, missing } = streamCalculatorService.getBalances(
    parsed.data.streamIds,
    parsed.data.at ?? nowInSeconds()
  );
  const computedInMs = Number((performance.now() - started).toFixed(3));
  return res.status(200).json({ count: balances.length, balances, missing, computedInMs });
});

/**
 * Subscribe with `?streamIds=a,b`, `?address=G...`, or neither for every
 * stream. A client subscribed to overlapping keys receives one event per key.
 */
router.get('/events', (req: Request, res: Response) => {
  const keys: string[] = [];
  if (typeof req.query.streamIds === 'string') {
    for (const id of req.query.streamIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_BULK_STREAMS)) {
      keys.push(`stream:${id}`);
    }
  }
  if (typeof req.query.address === 'string' && req.query.address.length > 0) {
    keys.push(`address:${req.query.address}`);
  }
  if (keys.length === 0) keys.push('all');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  res.write('retry: 5000\n\n');

  const clients = keys.map((key) => ({ key, clientId: streamSse.addClient(key, res) }));
  req.on('close', () => {
    for (const { key, clientId } of clients) {
      streamSse.removeClient(key, clientId);
    }
  });
});

router.post('/events', authenticateToken as any, requireAdmin as any, (req: Request, res: Response) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  }
  let applied = 0;
  for (const event of parsed.data.events) {
    if (streamEventSubscriber.apply(toNormalizedEvent(event))) applied += 1;
  }
  streamCalculatorService.processDueMilestones();
  return res.status(202).json({ received: parsed.data.events.length, applied });
});

router.get('/address/:address', (req: Request, res: Response) => {
  const at = parseAt(req.query.at) ?? nowInSeconds();
  const streams = streamCalculatorService.listByAddress(String(req.params.address));
  return res.status(200).json({
    count: streams.length,
    streams: streams.map((stream) => ({
      stream: serializeStream(stream),
      balance: computeBalance(stream, at),
    })),
  });
});

router.get('/:streamId', (req: Request, res: Response) => {
  const stream = streamCalculatorService.getStream(String(req.params.streamId));
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  const at = parseAt(req.query.at) ?? nowInSeconds();
  return res.status(200).json({ stream: serializeStream(stream), balance: computeBalance(stream, at) });
});

router.get('/:streamId/balance', (req: Request, res: Response) => {
  const balance = streamCalculatorService.getBalance(
    String(req.params.streamId),
    parseAt(req.query.at) ?? nowInSeconds()
  );
  if (!balance) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  return res.status(200).json(balance);
});

export default router;
