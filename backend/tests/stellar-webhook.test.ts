import { describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import webhooksRouter from '../src/routes/webhooks.js';
import {
  createStellarWebhookSignature,
  getStellarWebhookSecret,
  resetProcessedStellarTxHashes,
} from '../src/services/webhooks/stellarWebhook.service.js';

const app = express();
app.use(express.json());
app.use('/api/webhooks', webhooksRouter);

describe('Stellar Horizon Webhook Signature Verification Suite', () => {
  const secret = getStellarWebhookSecret();

  beforeEach(() => {
    resetProcessedStellarTxHashes();
  });

  it('accepts valid webhook signature and processes deposit idempotently', async () => {
    const timestamp = new Date().toISOString();
    const payload = {
      eventType: 'payment_received',
      txHash: '0xa1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      account: 'GAAX...STUDENT',
      amount: '1000.0000000',
      timestamp,
    };
    const rawPayload = JSON.stringify(payload);
    const signature = createStellarWebhookSignature(rawPayload, secret, timestamp);

    const res = await request(app)
      .post('/api/webhooks/stellar')
      .set('x-stellar-signature', `sha256=${signature}`)
      .set('x-stellar-timestamp', timestamp)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.result.credited).toBe(true);
  });

  it('rejects forged deposit notifications with invalid signature', async () => {
    const timestamp = new Date().toISOString();
    const payload = {
      eventType: 'payment_received',
      txHash: '0xforgedtxhash',
      account: 'GAAX...HACKER',
      amount: '999999.0000000',
      timestamp,
    };

    const res = await request(app)
      .post('/api/webhooks/stellar')
      .set('x-stellar-signature', 'sha256=invalidforgedsignature12345')
      .set('x-stellar-timestamp', timestamp)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('rejects replay attacks with timestamp outside 5-minute tolerance window', async () => {
    // Timestamp from 10 minutes ago
    const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const payload = {
      eventType: 'payment_received',
      txHash: '0xreplaytxhash',
      account: 'GAAX...STUDENT',
      amount: '50.0000000',
      timestamp: oldTimestamp,
    };
    const rawPayload = JSON.stringify(payload);
    const signature = createStellarWebhookSignature(rawPayload, secret, oldTimestamp);

    const res = await request(app)
      .post('/api/webhooks/stellar')
      .set('x-stellar-signature', `sha256=${signature}`)
      .set('x-stellar-timestamp', oldTimestamp)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('guarantees idempotent processing and prevents double crediting', async () => {
    const timestamp = new Date().toISOString();
    const payload = {
      eventType: 'payment_received',
      txHash: '0xunique_tx_12345',
      account: 'GAAX...STUDENT',
      amount: '100.0000000',
      timestamp,
    };
    const rawPayload = JSON.stringify(payload);
    const signature = createStellarWebhookSignature(rawPayload, secret, timestamp);

    // First request - Should credit balance
    const res1 = await request(app)
      .post('/api/webhooks/stellar')
      .set('x-stellar-signature', `sha256=${signature}`)
      .set('x-stellar-timestamp', timestamp)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.result.status).toBe('processed');
    expect(res1.body.result.credited).toBe(true);

    // Second request with same txHash - Should be suppressed idempotently without double credit
    const res2 = await request(app)
      .post('/api/webhooks/stellar')
      .set('x-stellar-signature', `sha256=${signature}`)
      .set('x-stellar-timestamp', timestamp)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.result.status).toBe('already_processed');
    expect(res2.body.result.credited).toBe(false);
  });
});
