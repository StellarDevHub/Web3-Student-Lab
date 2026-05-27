import { Server, Socket } from 'socket.io';
import { verifyToken } from '../auth/auth.service.js';
import { sseSessionManager } from '../sse/SseSessionManager.js';
import logger from '../utils/logger.js';
import { pubClient, subClient } from '../utils/redis.js';

export const initWebSocketGateway = (io: Server) => {
  logger.info('Initializing WebSocket Gateway...');

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

    // Ping/Pong Heartbeat is handled automatically by Socket.io,
    // but we can implement custom logic if needed.
    // Socket.io default heartbeat: pingInterval (25s), pingTimeout (5s)

    socket.on('disconnect', (reason) => {
      logger.info(`User disconnected: ${userId} (Reason: ${reason})`);
    });

    socket.on('subscribe', (channel: string) => {
      logger.info(`User ${userId} subscribed to channel: ${channel}`);
      socket.join(channel);
    });

    socket.on('unsubscribe', (channel: string) => {
      logger.info(`User ${userId} unsubscribed from channel: ${channel}`);
      socket.leave(channel);
    });
  });

  // Redis Pub/Sub Layer
  subClient.subscribe('dashboard_updated', 'user_metrics_updated', (err, count) => {
    if (err) {
      logger.error('Failed to subscribe to Redis channels', err);
    } else {
      logger.info(`Subscribed to ${count} Redis channels`);
    }
  });

  subClient.on('message', (channel, message) => {
    logger.debug(`Received message from Redis channel ${channel}: ${message}`);
    const data = JSON.parse(message);

    // Broadcast to the corresponding Socket.io room/channel
    if (channel === 'dashboard_updated') {
      io.emit('dashboard_updated', data);
    } else if (channel === 'user_metrics_updated') {
      if (data.userId) {
        io.to(`user:${data.userId}`).emit('user_metrics_updated', data);
        sseSessionManager.emitToUser(String(data.userId), 'user_metrics_updated', data);
      }
    }
  });
};

/**
 * Utility function to broadcast events from other parts of the backend
 */
export const broadcastEvent = async (channel: string, data: unknown) => {
  await pubClient.publish(channel, JSON.stringify(data));
};
