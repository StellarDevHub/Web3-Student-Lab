import { describe, expect, it } from '@jest/globals';
import {
  canonicalizeWebhookPayload,
  createWebhookSignature,
  verifyWebhookSignature,
} from '../src/services/webhooks/signature.js';

describe('webhook signature helpers', () => {
  it('canonicalizes nested payloads deterministically', () => {
    const payload = {
      z: 3,
      a: {
        y: 2,
        x: 1,
      },
      list: [
        {
          b: 2,
          a: 1,
        },
        3,
      ],
    };

    expect(canonicalizeWebhookPayload(payload)).toBe(
      JSON.stringify({
        a: { x: 1, y: 2 },
        list: [{ a: 1, b: 2 }, 3],
        z: 3,
      })
    );
  });

  it('creates and verifies timestamped HMAC signatures', () => {
    const payload = canonicalizeWebhookPayload({ id: 'evt_1', type: 'lab.completed' });
    const timestamp = '2026-05-31T00:00:00.000Z';
    const secret = 'super-secret-value';
    const signature = createWebhookSignature(payload, secret, timestamp);

    expect(
      verifyWebhookSignature(payload, `sha256=${signature}`, secret, timestamp, 5 * 60 * 1000,
        new Date('2026-05-31T00:01:00.000Z'))
    ).toBe(true);
  });

  it('rejects stale or invalid signatures', () => {
    const payload = canonicalizeWebhookPayload({ id: 'evt_1', type: 'lab.completed' });
    const secret = 'super-secret-value';
    const timestamp = '2026-05-31T00:00:00.000Z';
    const signature = createWebhookSignature(payload, secret, timestamp);

    expect(
      verifyWebhookSignature(payload, `sha256=${signature}`, secret, timestamp, 1000,
        new Date('2026-05-31T00:00:03.000Z'))
    ).toBe(false);
    expect(verifyWebhookSignature(payload, 'sha256=deadbeef', secret, timestamp)).toBe(false);
  });
});

