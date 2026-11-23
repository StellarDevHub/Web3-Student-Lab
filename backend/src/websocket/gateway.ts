import { Server, Socket } from 'socket.io';
import { verifyToken } from '../auth/auth.service.js';
import { registerWebSocketTerminator } from '../auth/sessionMonitor.js';
import redisClient from '../cache/RedisClient.js';
import { sseSessionManager } from '../sse/SseSessionManager.js';
import { getWebSocketCluster } from './WebSocketCluster.js';
import logger from '../utils/logger.js';

export const initWebSocketGateway = (io: Server) => {
  logger.info('Initializing WebSocket Gateway...');

  const cluster = getWebSocketCluster();
  void cluster.start().catch((error) => {
    logger.error('Failed to start WebSocket cluster consumer', error);
  });

  // Extended-idle sessions (30m) have their WebSocket channels terminated by
  // the session monitor (#1116) — drop every socket belonging to the user.
  registerWebSocketTerminator(async (userId: string) => {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }
  });

  // JWT Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = verifyToken(token.replace('Bearer ', ''));
      (socket as unknown as { userId: string }).userId = decoded.userId;
      next();
    } catch (_err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as unknown as { userId: string }).userId;
    logger.info(`User connected to WebSocket: ${userId} (Socket ID: ${socket.id})`);

    // Join a private room for the user
    socket.join(`user:${userId}`);

    const lastEventId =
      socket.handshake.auth?.lastEventId ?? socket.handshake.headers['last-event-id'];
    cluster.registerSocket(socket, { userId, rooms: [`user:${userId}`] });
    if (lastEventId) {
      void cluster.resume(socket.id, String(lastEventId)).catch((error) => {
        logger.error(`Failed to replay missed events for ${socket.id}`, error);
      });
    }

    socket.on('resume', (eventId: string) => {
      if (typeof eventId !== 'string' || !eventId) {
        return;
      }
      void cluster.resume(socket.id, eventId).catch((error) => {
        logger.error(`Failed to replay missed events for ${socket.id}`, error);
      });
    });

    socket.on('disconnect', (reason) => {
      cluster.unregisterSocket(socket.id);
      logger.info(`User disconnected: ${userId} (Reason: ${reason})`);
    });

    socket.on('subscribe', (channel: string) => {
      logger.info(`User ${userId} subscribed to channel: ${channel}`);
      socket.join(channel);
      cluster.addRoom(socket.id, channel);
    });

    socket.on('unsubscribe', (channel: string) => {
      logger.info(`User ${userId} unsubscribed from channel: ${channel}`);
      socket.leave(channel);
      cluster.removeRoom(socket.id, channel);
    });
  });

  // Redis Pub/Sub Layer
  const subClient = redisClient.getSubClient();
  if (subClient) {
    subClient.subscribe('dashboard_updated', 'user_metrics_updated', 'course_notifications', (err, count) => {
      if (err) {
        logger.error('Failed to subscribe to Redis channels', err);
      } else {
        logger.info(`Subscribed to ${count} Redis channels`);
      }
    });

    subClient.on('message', (channel, message) => {
      logger.debug(`Received message from Redis channel ${channel}: ${message}`);
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(message);
      } catch (error) {
        logger.warn(`Discarding malformed Redis message on ${channel}`, error);
        return;
      }

      // Live WebSocket delivery is handled by the Redis Streams consumer group
      // (see broadcastEvent + WebSocketCluster). The pub/sub bridge remains for
      // SSE consumers and for events published by other services.
      if (channel === 'user_metrics_updated') {
        if (data.userId) {
          sseSessionManager.emitToUser(String(data.userId), 'user_metrics_updated', data);
        }
      } else if (channel === 'course_notifications') {
        // NotificationService publishes straight to pub/sub; persist it to the
        // stream so reconnecting clients can replay it.
        void cluster.publish('course_notifications', 'course_notification', data).catch((error) => {
          logger.error('Failed to bridge course notification to Redis stream', error);
        });
      }
    });
  } else {
    logger.warn('Redis subClient not available, WebSocket pub/sub disabled');
  }
};

/**
 * Utility function to broadcast events from other parts of the backend
 */
export const broadcastEvent = async (channel: string, data: unknown): Promise<string | null> => {
  const cluster = getWebSocketCluster();
  let eventId: string | null = null;
  try {
    eventId = await cluster.publish(channel, channel, data);
  } catch (error) {
    logger.error(`Failed to publish ${channel} to Redis stream`, error);
  }

  const pubClient = redisClient.getPubClient();
  if (pubClient) {
    await pubClient.publish(channel, JSON.stringify(data));
  }

  return eventId;
};
