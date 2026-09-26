import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  enqueueToDLQ,
  getDLQTriageSummary,
  reSignWebhookPayload,
  replayDLQJob,
  resetDLQStore,
  stripStaleSignatureHeaders,
  triageDLQFailure,
} from '../src/services/dlq.service.js';
import {
  WEBHOOK_DELIVERY_QUEUE_NAME,
  webhookDeliveryQueue,
} from '../src/services/webhooks/queue.js';
import {
  canonicalizeWebhookPayload,
  verifyWebhookSignature,
} from '../src/services/webhooks/signature.js';
import type { WebhookDeliveryJobData } from '../src/services/webhooks/types.js';

const buildWebhookData = (): WebhookDeliveryJobData => ({
  deliveryId: 'del_100',
  idempotencyKey: 'idem_100',
  destination: {
    url: 'https://example.test/webhook',
    secret: 'super-secret',
    headers: {
      'x-custom': 'kept',
      'x-webhook-signature': 'sha256=stale-signature',
      'x-webhook-timestamp': '2020-01-01T00:00:00.000Z',
    },
  },
  event: {
    id: 'evt_100',
    type: 'certificate.minted',
    occurredAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
    data: { certificateId: 'cert_1' },
  },
  metadata: { foo: 'bar' },
});

describe('DLQ automated failure triage (#1422)', () => {
  it('classifies rate limits, timeouts, network and server errors as replayable', () => {
    expect(triageDLQFailure({ error: 'HTTP 429 Too Many Requests' })).toMatchObject({
      category: 'rate_limited',
      action: 'replay',
      retryable: true,
    });
    expect(triageDLQFailure({ error: 'request timed out' })).toMatchObject({
      category: 'timeout',
      action: 'replay',
      retryable: true,
    });
    expect(triageDLQFailure({ error: 'connect ECONNREFUSED 127.0.0.1:443' })).toMatchObject({
      category: 'network',
      action: 'replay',
      retryable: true,
    });
    expect(
      triageDLQFailure({ error: 'Retryable webhook delivery failure (503): unavailable' }),
    ).toMatchObject({ category: 'server_error', action: 'replay', retryable: true });
  });

  it('escalates permanent client and validation failures', () => {
    expect(
      triageDLQFailure({ error: 'Webhook delivery rejected with status 400' }),
    ).toMatchObject({ category: 'client_error', action: 'escalate', retryable: false });
    expect(triageDLQFailure({ error: 'payload validation failed' })).toMatchObject({
      category: 'validation',
      action: 'escalate',
      retryable: false,
    });
    expect(triageDLQFailure({ error: 'unexpected mystery' })).toMatchObject({
      category: 'unknown',
      action: 'escalate',
    });
  });

  it('prefers an explicit status code over message parsing', () => {
    const triage = triageDLQFailure({ error: 'boom', statusCode: 429 });
    expect(triage.category).toBe('rate_limited');
    expect(triage.statusCode).toBe(429);
  });

  it('attaches triage to enqueued records and summarises the store', async () => {
    resetDLQStore();

    const replayed = await enqueueToDLQ({
      originalQueue: WEBHOOK_DELIVERY_QUEUE_NAME,
      jobName: 'a',
      data: {},
      error: 'request timed out',
      attemptsMade: 5,
    });
    await enqueueToDLQ({
      originalQueue: WEBHOOK_DELIVERY_QUEUE_NAME,
      jobName: 'b',
      data: {},
      error: 'Webhook delivery rejected with status 400',
      attemptsMade: 5,
    });

    expect(replayed.triage?.category).toBe('timeout');

    const summary = await getDLQTriageSummary();
    expect(summary.total).toBe(2);
    expect(summary.byCategory.timeout).toBe(1);
    expect(summary.byCategory.client_error).toBe(1);
    expect(summary.byAction.replay).toBe(1);
    expect(summary.byAction.escalate).toBe(1);
    expect(summary.replayableIds).toEqual([replayed.dlqId]);
  });
});

describe('DLQ cryptographic payload re-signing (#1422)', () => {
  beforeEach(() => resetDLQStore());
  afterEach(() => jest.restoreAllMocks());

  it('strips only stale signature headers', () => {
    const sanitized = stripStaleSignatureHeaders({
      'x-custom': 'kept',
      'x-webhook-signature': 'sha256=stale',
      'X-Webhook-Timestamp': 'old',
    });
    expect(sanitized).toEqual({ 'x-custom': 'kept' });
  });

  it('re-signs a payload with a verifiable fresh signature', () => {
    const data = buildWebhookData();
    const timestamp = '2030-01-01T00:00:00.000Z';
    const resigned = reSignWebhookPayload(data, { timestamp });

    expect(resigned.signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(
      verifyWebhookSignature(
        resigned.serializedPayload,
        resigned.signature,
        'super-secret',
        timestamp,
        1_000,
        new Date(timestamp),
      ),
    ).toBe(true);
  });

  it('requires a signing secret', () => {
    const previous = process.env.WEBHOOK_SIGNING_SECRET;
    delete process.env.WEBHOOK_SIGNING_SECRET;
    try {
      expect(() =>
        reSignWebhookPayload({
          ...buildWebhookData(),
          destination: { url: 'https://example.test/webhook' },
        }),
      ).toThrow(/WEBHOOK_SIGNING_SECRET/);
    } finally {
      if (previous !== undefined) {
        process.env.WEBHOOK_SIGNING_SECRET = previous;
      }
    }
  });

  it('re-signs webhook jobs on replay and clears stale signature headers', async () => {
    const data = buildWebhookData();
    const record = await enqueueToDLQ({
      originalQueue: WEBHOOK_DELIVERY_QUEUE_NAME,
      jobName: data.event.type,
      data: data as unknown as Record<string, any>,
      error: 'Retryable webhook delivery failure (503): unavailable',
      attemptsMade: 5,
    });

    const addSpy = jest
      .spyOn(webhookDeliveryQueue, 'add')
      .mockResolvedValue({ id: 'replayed_1' } as any);

    const result = await replayDLQJob(record.dlqId);
    expect(result.success).toBe(true);
    expect(addSpy).toHaveBeenCalledTimes(1);

    const call = addSpy.mock.calls[0] as unknown as [string, any, unknown];
    const payload = call[1];
    expect(payload.destination.headers['x-webhook-signature']).toBeUndefined();
    expect(payload.destination.headers['x-webhook-timestamp']).toBeUndefined();
    expect(payload.destination.headers['x-custom']).toBe('kept');
    expect(payload.replayed.signature).toMatch(/^sha256=/);

    const serialized = canonicalizeWebhookPayload({
      event: payload.event,
      metadata: payload.metadata ?? {},
      deliveryId: payload.deliveryId,
    });
    expect(
      verifyWebhookSignature(
        serialized,
        payload.replayed.signature,
        'super-secret',
        payload.replayed.timestamp,
      ),
    ).toBe(true);
  });
});
