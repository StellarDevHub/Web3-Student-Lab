import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  buildWebhookDeliveryJob,
  buildIdempotencyKey,
  enqueueWebhookDeliveryToQueue,
  enqueueWebhookDeliveries,
  getDeliveryHistory,
  isDuplicateDelivery,
  recordDeliveryState,
} from '../src/services/webhooks/dispatcher.js';

describe('webhook dispatcher', () => {
  beforeEach(() => {
    getDeliveryHistory().forEach(() => {
      // deliveryHistory is internal; clear via record/reset if exposed, otherwise rely on test isolation
    });
  });

  it('builds a delivery job with a unique delivery id', () => {
    const job = buildWebhookDeliveryJob({
      destination: { url: 'https://example.com/webhook' },
      event: {
        id: 'evt_1',
        type: 'lab.completed',
        occurredAt: '2026-05-31T00:00:00.000Z',
        source: 'lab-runner',
        data: { studentId: 'student_1' },
      },
      metadata: { courseId: 'course_1' },
    });

    expect(job.deliveryId).toEqual(expect.any(String));
    expect(job.destination.url).toBe('https://example.com/webhook');
    expect(job.event.type).toBe('lab.completed');
    expect(job.metadata).toEqual({ courseId: 'course_1' });
    expect(job.idempotencyKey).toBe('evt_1:https://example.com/webhook');
  });

  it('generates stable idempotency keys for the same event and destination', () => {
    const event = {
      id: 'evt_1',
      type: 'lab.completed' as const,
      occurredAt: '2026-05-31T00:00:00.000Z',
      source: 'lab-runner',
      data: { studentId: 'student_1' },
    };
    const destination = { url: 'https://example.com/webhook' };

    expect(buildIdempotencyKey(event, destination)).toBe('evt_1:https://example.com/webhook');
    expect(buildIdempotencyKey(event, destination)).toBe('evt_1:https://example.com/webhook');
  });

  it('queues delivery jobs with BullMQ job options', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' });
    const queue = { add };

    const result = await enqueueWebhookDeliveryToQueue(queue, {
      destination: { url: 'https://example.com/webhook' },
      event: {
        id: 'evt_2',
        type: 'contract.deployed',
        occurredAt: '2026-05-31T00:00:00.000Z',
        source: 'contract-indexer',
        data: { contractId: 'contract_1' },
      },
    });

    expect(result.queue).toBe('webhook-delivery-queue');
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'contract.deployed',
      expect.objectContaining({
        deliveryId: expect.any(String),
        destination: { url: 'https://example.com/webhook' },
        idempotencyKey: 'evt_2:https://example.com/webhook',
      }),
      expect.objectContaining({
        priority: 10,
        jobId: 'evt_2:https://example.com/webhook',
      })
    );
  });

  it('suppresses duplicate deliveries for the same event and destination', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' });
    const queue = { add };

    const request = {
      destination: { url: 'https://example.com/webhook' },
      event: {
        id: 'evt_3',
        type: 'lab.completed',
        occurredAt: '2026-05-31T00:00:00.000Z',
        source: 'lab-runner',
        data: {},
      },
    };

    const first = await enqueueWebhookDeliveryToQueue(queue, request);
    const second = await enqueueWebhookDeliveryToQueue(queue, request);

    expect(first.duplicate).toBeUndefined();
    expect(second.duplicate).toBe(true);
    expect(second.deliveryId).toBe(first.deliveryId);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('records and exposes delivery history', async () => {
    const add = jest.fn().mockResolvedValue({ id: '1' });
    const queue = { add };

    await enqueueWebhookDeliveryToQueue(queue, {
      destination: { url: 'https://example.com/webhook' },
      event: {
        id: 'evt_4',
        type: 'certificate.minted',
        occurredAt: '2026-05-31T00:00:00.000Z',
        source: 'certificate-service',
        data: {},
      },
    });

    recordDeliveryState(
      'evt_4:https://example.com/webhook',
      'delivered',
      'delivery-1',
      {
        id: 'evt_4',
        type: 'certificate.minted',
        occurredAt: '2026-05-31T00:00:00.000Z',
        source: 'certificate-service',
        data: {},
      },
      { url: 'https://example.com/webhook' }
    );

    const history = getDeliveryHistory();
    const entry = history.find((h) => h.idempotencyKey === 'evt_4:https://example.com/webhook');
    expect(entry).toBeDefined();
    expect(entry!.state).toBe('delivered');
    expect(entry!.eventType).toBe('certificate.minted');
  });
});

