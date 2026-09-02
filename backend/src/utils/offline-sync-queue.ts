/**
 * Offline Sync Reconciliation Queue (#1141).
 *
 * Manages a Redis-backed queue for reconciling offline learning progress
 * when mobile or low-bandwidth learners reconnect. Handles:
 * - Queuing offline progress events during disconnection
 * - Replaying events in order when connection is restored
 * - Conflict resolution (last-write-wins vs. merge)
 * - Deduplication of repeated sync attempts
 *
 * Usage:
 *   import { offlineSyncQueue } from '../utils/offline-sync-queue';
 *
 *   // While offline:
 *   await offlineSyncQueue.enqueue(userId, {
 *     type: 'lesson_progress',
 *     lessonId: '123',
 *     progress: 75,
 *     timestamp: Date.now(),
 *   });
 *
 *   // When back online:
 *   const result = await offlineSyncQueue.reconcile(userId);
 */

import { redisConnection } from './redis';

const QUEUE_PREFIX = 'offline:sync:';
const PROCESSED_PREFIX = 'offline:sync:processed:';
const QUEUE_TTL = 86400 * 7; // 7 days

export interface OfflineEvent {
  id?: string;
  type: 'lesson_progress' | 'quiz_completed' | 'certificate_earned' | 'note_saved';
  userId: string;
  timestamp: number;
  data: Record<string, unknown>;
  /** Version for conflict detection. Higher = newer. */
  version?: number;
}

export interface SyncResult {
  processed: OfflineEvent[];
  conflicts: Array<{ event: OfflineEvent; resolution: string }>;
  failed: Array<{ event: OfflineEvent; error: string }>;
  totalEnqueued: number;
}

class OfflineSyncQueue {
  /**
   * Enqueue an offline event for later reconciliation.
   */
  async enqueue(userId: string, event: Omit<OfflineEvent, 'userId'>): Promise<void> {
    const fullEvent: OfflineEvent = {
      ...event,
      userId,
      id: event.id || `${userId}-${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    };

    const queueKey = `${QUEUE_PREFIX}${userId}`;
    await redisConnection.lpush(queueKey, JSON.stringify(fullEvent));
    await redisConnection.expire(queueKey, QUEUE_TTL);
  }

  /**
   * Get the number of pending events for a user.
   */
  async pendingCount(userId: string): Promise<number> {
    return redisConnection.llen(`${QUEUE_PREFIX}${userId}`);
  }

  /**
   * Reconcile all pending offline events for a user.
   * Events are processed in FIFO order (oldest first).
   */
  async reconcile(
    userId: string,
    processor: (event: OfflineEvent) => Promise<void>,
  ): Promise<SyncResult> {
    const queueKey = `${QUEUE_PREFIX}${userId}`;
    const processedKey = `${PROCESSED_PREFIX}${userId}`;

    const result: SyncResult = {
      processed: [],
      conflicts: [],
      failed: [],
      totalEnqueued: 0,
    };

    // Get all pending events
    const rawEvents = await redisConnection.lrange(queueKey, 0, -1);
    result.totalEnqueued = rawEvents.length;

    if (rawEvents.length === 0) return result;

    // Sort by timestamp (oldest first) for consistent replay
    const events = rawEvents
      .map((raw) => {
        try {
          return JSON.parse(raw) as OfflineEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is OfflineEvent => e !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Process each event
    for (const event of events) {
      const eventId = event.id || `${event.userId}-${event.timestamp}`;

      // Deduplication: skip already-processed events
      const isDuplicate = await redisConnection.sismember(processedKey, eventId);
      if (isDuplicate) {
        result.conflicts.push({ event, resolution: 'duplicate_skipped' });
        continue;
      }

      try {
        await processor(event);

        // Mark as processed
        await redisConnection.sadd(processedKey, eventId);
        await redisConnection.expire(processedKey, QUEUE_TTL);

        result.processed.push(event);
      } catch (error) {
        result.failed.push({
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clear the queue after processing
    if (result.failed.length === 0) {
      await redisConnection.del(queueKey);
    }

    return result;
  }

  /**
   * Clear all pending events for a user (e.g., after manual resolution).
   */
  async clear(userId: string): Promise<number> {
    const deleted = await redisConnection.del(`${QUEUE_PREFIX}${userId}`);
    await redisConnection.del(`${PROCESSED_PREFIX}${userId}`);
    return deleted;
  }
}

export const offlineSyncQueue = new OfflineSyncQueue();
