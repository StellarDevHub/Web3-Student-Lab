import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  analyzeWebhookFailures,
  buildSignedWebhookHeaders,
  dispatchWebhookEvent,
  replayWebhookDelivery,
  signWebhookPayload,
  verifyWebhookPayloadSignature,
  WEBHOOK_REQUEST_TIMEOUT_MS,
  WEBHOOK_RETRY_SCHEDULE_MS,
  WEBHOOK_RETRY_WINDOW_MS,
} from '../src/services/webhookDispatcher.js';
import {
  endpointCircuitBreaker,
  isRetryWindowExhausted,
  webhookDeliveryLog,
} from '../src/services/webhookDeliveryService.js';

describe('BE-075 Real-Time Webhook Dispatch Engine', () => {
  beforeEach(() => {
    webhookDeliveryLog.reset();
    endpointCircuitBreaker.reset();
  });

  it('signs payloads with HMAC-SHA256 and detects tampering', () => {
    const payload = { event: 'course.completed', studentId: 'stu_123', courseId: 'web3-101' };
    const secret = 'university-webhook-secret';

    const signature = signWebhookPayload(payload, secret);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyWebhookPayloadSignature(payload, signature, secret)).toBe(true);
    expect(verifyWebhookPayloadSignature(payload, `sha256=${signature}`, secret)).toBe(true);

    // Tampered payload or wrong secret must fail verification
    expect(
      verifyWebhookPayloadSignature({ ...payload, studentId: 'stu_999' }, signature, secret)
    ).toBe(false);
    expect(verifyWebhookPayloadSignature(payload, signature, 'wrong-secret')).toBe(false);
  });

  it('includes X-Signature-SHA256 and timestamp headers on outgoing deliveries', () => {
    const payload = JSON.stringify({ id: 'evt_be075', type: 'lab.completed' });
    const secret = 'uni-secret';
    const headers = buildSignedWebhookHeaders({
      deliveryId: 'del_1',
      eventType: 'lab.completed',
      payload,
      secret,
      timestamp: '2026-11-23T10:00:00.000Z',
    });

    expect(headers['x-webhook-timestamp']).toBe('2026-11-23T10:00:00.000Z');
    expect(headers['x-signature-sha256']).toBe(signWebhookPayload(payload, secret));
    expect(headers['x-webhook-signature']).toMatch(/^sha256=/);
  });

  it('enforces a 5-second default timeout and 72-hour exponential backoff window', () => {
    expect(WEBHOOK_REQUEST_TIMEOUT_MS).toBe(5000);
    expect(WEBHOOK_RETRY_WINDOW_MS).toBe(72 * 60 * 60 * 1000);

    const totalScheduledMs = WEBHOOK_RETRY_SCHEDULE_MS.reduce((sum, ms) => sum + ms, 0);
    expect(totalScheduledMs).toBeGreaterThan(48 * 60 * 60 * 1000);
    expect(totalScheduledMs).toBeLessThanOrEqual(WEBHOOK_RETRY_WINDOW_MS);

    const start = Date.now();
    expect(isRetryWindowExhausted(start, start + 71 * 60 * 60 * 1000)).toBe(false);
    expect(isRetryWindowExhausted(start, start + 72 * 60 * 60 * 1000)).toBe(true);
  });

  it('dispatches events, analyzes failures, and supports manual replay', async () => {
    const event = {
      id: 'evt_uni_1',
      type: 'course.completed' as const,
      occurredAt: '2026-11-23T10:00:00.000Z',
      source: 'curriculum-service',
      data: { studentId: 'stu_1', courseId: 'soroban-101' },
    };
    const destination = {
      id: 'uni-mit',
      url: 'https://lms.university.edu/webhooks',
      secret: 'mit-secret',
    };

    const [dispatched] = await dispatchWebhookEvent(event, [destination]);
    expect(dispatched).toBeDefined();
    expect(dispatched!.deliveryId).toBeTruthy();

    // Simulate a 503 failure in the delivery log
    const job = webhookDeliveryLog.getJob(dispatched!.deliveryId)!;
    webhookDeliveryLog.record(job, {
      status: 'failed',
      attempts: 3,
      lastStatusCode: 503,
      lastError: 'Retryable webhook delivery failure (503): Service Unavailable',
    });

    const analysis = await analyzeWebhookFailures();
    expect(analysis.retryWindowHours).toBe(72);
    expect(analysis.timeoutMs).toBe(5000);
    expect(analysis.totals.failed).toBe(1);
    expect(analysis.failuresByCategory['http_503']).toBe(1);
    expect(analysis.failuresByEndpoint).toHaveLength(1);
    expect(analysis.failuresByEndpoint[0]?.endpointKey).toBe('uni-mit');

    // Trigger manual replay
    const replayed = await replayWebhookDelivery(dispatched!.deliveryId, {
      requestedBy: 'admin_1',
    });
    expect(replayed.retriggeredFrom).toBe(dispatched!.deliveryId);
    expect(replayed.deliveryId).not.toBe(dispatched!.deliveryId);
    expect(webhookDeliveryLog.get(dispatched!.deliveryId)?.status).toBe('retriggered');
  });
});
