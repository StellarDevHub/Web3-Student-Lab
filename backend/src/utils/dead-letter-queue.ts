/**
 * Dead Letter Queue (DLQ) Auto-Retry & Webhook Alerting Worker (#1131).
 *
 * Manages failed messages that exceeded retry limits. Provides:
 * - Automatic retry with exponential backoff
 * - Webhook alerting for persistent failures
 * - Manual retry and inspection
 * - Message archival after final failure
 *
 * Usage:
 *   import { dlq } from '../utils/dead-letter-queue';
 *
 *   await dlq.enqueue('lesson-sync', { userId: '123', lessonId: '456' }, 'Connection timeout');
 *   await dlq.startWorker(); // Background worker
 */

import { redisConnection } from './redis';

const DLQ_PREFIX = 'dlq:';
const DLQ_SET_KEY = 'dlq:pending';
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000]; // 1m, 5m, 15m

export interface DLQMessage {
  id: string;
  queue: string;
  payload: Record<string, unknown>;
  error: string;
  attempts: number;
  maxRetries: number;
  createdAt: number;
  nextRetryAt: number;
  lastError?: string;
}

export interface DLQStats {
  pending: number;
  retrying: number;
  archived: number;
  byQueue: Record<string, number>;
}

class DeadLetterQueue {
  /**
   * Add a failed message to the DLQ.
   */
  async enqueue(
    queue: string,
    payload: Record<string, unknown>,
    error: string,
    attempts: number = 0,
  ): Promise<string> {
    const id = `${queue}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message: DLQMessage = {
      id,
      queue,
      payload,
      error,
      attempts,
      maxRetries: MAX_RETRIES,
      createdAt: Date.now(),
      nextRetryAt: Date.now() + RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)],
    };

    await redisConnection.set(`${DLQ_PREFIX}${id}`, JSON.stringify(message));
    await redisConnection.sadd(DLQ_SET_KEY, id);
    return id;
  }

  /**
   * Get messages due for retry.
   */
  async getRetryable(): Promise<DLQMessage[]> {
    const ids = await redisConnection.smembers(DLQ_SET_KEY);
    const retryable: DLQMessage[] = [];
    const now = Date.now();

    for (const id of ids) {
      const raw = await redisConnection.get(`${DLQ_PREFIX}${id}`);
      if (!raw) {
        await redisConnection.srem(DLQ_SET_KEY, id);
        continue;
      }
      const msg: DLQMessage = JSON.parse(raw);
      if (msg.attempts < msg.maxRetries && msg.nextRetryAt <= now) {
        retryable.push(msg);
      }
    }

    return retryable;
  }

  /**
   * Mark a message as archived (permanently failed).
   */
  async archive(id: string): Promise<void> {
    await redisConnection.srem(DLQ_SET_KEY, id);
    const raw = await redisConnection.get(`${DLQ_PREFIX}${id}`);
    if (raw) {
      const msg: DLQMessage = JSON.parse(raw);
      await redisConnection.set(
        `${DLQ_PREFIX}archived:${id}`,
        JSON.stringify({ ...msg, archivedAt: Date.now() }),
        'EX',
        86400 * 30, // Keep 30 days
      );
      await redisConnection.del(`${DLQ_PREFIX}${id}`);
    }
  }

  /**
   * Manually retry a specific message.
   */
  async manualRetry(id: string): Promise<DLQMessage | null> {
    const raw = await redisConnection.get(`${DLQ_PREFIX}${id}`);
    if (!raw) return null;
    const msg: DLQMessage = JSON.parse(raw);
    msg.attempts = 0;
    msg.nextRetryAt = Date.now();
    await redisConnection.set(`${DLQ_PREFIX}${id}`, JSON.stringify(msg));
    return msg;
  }

  /**
   * Get DLQ statistics.
   */
  async getStats(): Promise<DLQStats> {
    const ids = await redisConnection.smembers(DLQ_SET_KEY);
    let pending = 0;
    let retrying = 0;
    const byQueue: Record<string, number> = {};

    for (const id of ids) {
      const raw = await redisConnection.get(`${DLQ_PREFIX}${id}`);
      if (!raw) continue;
      const msg: DLQMessage = JSON.parse(raw);
      byQueue[msg.queue] = (byQueue[msg.queue] || 0) + 1;
      if (msg.attempts >= msg.maxRetries) {
        pending++;
      } else {
        retrying++;
      }
    }

    return { pending, retrying, archived: 0, byQueue };
  }

  /**
   * Start the background worker that processes retryable messages.
   */
  async startWorker(
    processor: (msg: DLQMessage) => Promise<void>,
    alertWebhook?: string,
  ): Promise<void> {
    setInterval(async () => {
      const retryable = await this.getRetryable();
      for (const msg of retryable) {
        try {
          msg.attempts++;
          msg.nextRetryAt = Date.now() + RETRY_DELAYS_MS[Math.min(msg.attempts, RETRY_DELAYS_MS.length - 1)];
          await redisConnection.set(`${DLQ_PREFIX}${msg.id}`, JSON.stringify(msg));
          await processor(msg);
        } catch (error) {
          msg.lastError = error instanceof Error ? error.message : String(error);
          if (msg.attempts >= msg.maxRetries) {
            await this.archive(msg.id);
            if (alertWebhook) {
              await this.sendAlert(alertWebhook, msg);
            }
          } else {
            await redisConnection.set(`${DLQ_PREFIX}${msg.id}`, JSON.stringify(msg));
          }
        }
      }
    }, 30_000); // Check every 30 seconds
  }

  /**
   * Send webhook alert for permanently failed messages.
   */
  private async sendAlert(webhookUrl: string, msg: DLQMessage): Promise<void> {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dlq_permanent_failure',
          queue: msg.queue,
          messageId: msg.id,
          attempts: msg.attempts,
          error: msg.lastError || msg.error,
          payload: msg.payload,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Alert failure is non-critical
    }
  }
}

export const dlq = new DeadLetterQueue();
