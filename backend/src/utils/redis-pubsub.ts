/**
 * Multi-Node WebSocket State Synchronization via Redis Pub/Sub (#1136).
 *
 * Enables WebSocket servers running on multiple nodes to broadcast state
 * changes to all connected clients, regardless of which node they're
 * connected to. Uses Redis Pub/Sub as the message bus between nodes.
 *
 * Usage:
 *   import { createWsSync } from '../utils/redis-pubsub';
 *
 *   const wsSync = createWsSync('lesson-updates');
 *   wsSync.publish({ type: 'progress', userId, lessonId, completed: true });
 *   wsSync.subscribe((message) => { /* broadcast to local WS clients *\/ });
 */

import { redisConnection } from './redis';

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export interface WsSyncChannel {
  publish: (message: WsMessage) => Promise<void>;
  subscribe: (handler: (message: WsMessage) => void) => () => void;
  destroy: () => Promise<void>;
}

/**
 * Create a synchronized WebSocket channel backed by Redis Pub/Sub.
 *
 * @param channelName  Unique channel identifier (e.g. "lesson-updates")
 * @param redis        Optional Redis client override (defaults to shared connection)
 */
export function createWsSync(
  channelName: string,
  redis: typeof redisConnection = redisConnection,
): WsSyncChannel {
  const subscribers = new Set<(message: WsMessage) => void>();
  let subscriberClient: typeof redis | null = null;

  function getSubscriberClient() {
    if (!subscriberClient) {
      // ioredis: create a dedicated connection for subscriptions
      // (subscribing on a shared client blocks other commands)
      subscriberClient = redis.duplicate?.() ?? redis;
    }
    return subscriberClient;
  }

  async function publish(message: WsMessage): Promise<void> {
    try {
      const payload = JSON.stringify({
        ...message,
        _channel: channelName,
        _timestamp: Date.now(),
      });
      await redis.publish(channelName, payload);
    } catch (err) {
      console.error(`[ws-sync] Publish error on "${channelName}":`, err);
    }
  }

  function subscribe(handler: (message: WsMessage) => void): () => void {
    subscribers.add(handler);

    // Set up Redis subscription on first subscriber
    if (subscribers.size === 1) {
      const client = getSubscriberClient();
      client.subscribe(channelName);
      client.on('message', (channel: string, message: string) => {
        if (channel !== channelName) return;
        try {
          const parsed = JSON.parse(message) as WsMessage;
          // Skip our own messages (loop prevention)
          if (parsed._sender === process.env.NODE_ID) return;
          // Notify all local handlers
          for (const sub of subscribers) {
            try {
              sub(parsed);
            } catch (err) {
              console.error(`[ws-sync] Handler error on "${channelName}":`, err);
            }
          }
        } catch {
          // Ignore malformed messages
        }
      });
    }

    // Return unsubscribe function
    return () => {
      subscribers.delete(handler);
      if (subscribers.size === 0 && subscriberClient) {
        subscriberClient.unsubscribe(channelName);
      }
    };
  }

  async function destroy(): Promise<void> {
    subscribers.clear();
    if (subscriberClient) {
      await subscriberClient.unsubscribe(channelName);
      if (subscriberClient !== redis && subscriberClient.quit) {
        await subscriberClient.quit();
      }
      subscriberClient = null;
    }
  }

  return { publish, subscribe, destroy };
}

/**
 * Broadcast a lesson progress update to all nodes.
 */
export async function broadcastLessonProgress(
  userId: string,
  lessonId: string,
  completed: boolean,
  progress: number,
): Promise<void> {
  const channel = createWsSync('lesson-progress');
  await channel.publish({
    type: 'lesson-progress',
    userId,
    lessonId,
    completed,
    progress,
  });
  await channel.destroy();
}

/**
 * Broadcast a certificate issuance to all nodes.
 */
export async function broadcastCertificateIssued(
  userId: string,
  certificateId: string,
): Promise<void> {
  const channel = createWsSync('certificates');
  await channel.publish({
    type: 'certificate-issued',
    userId,
    certificateId,
  });
  await channel.destroy();
}
