import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import logger from '../utils/logger.js';
import { socketAuthMiddleware } from './middleware/auth.middleware.js';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware.js';
import { ConnectionManager } from './ConnectionManager.js';
import { EventRouter } from './EventRouter.js';
import { getWebSocketCluster } from './WebSocketCluster.js';

let io: Server;
const connectionManager = new ConnectionManager();

export const initializeWebSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(socketAuthMiddleware);
  io.use(rateLimitMiddleware);

  const eventRouter = new EventRouter(io, connectionManager);
  const cluster = getWebSocketCluster();
  void cluster.start().catch((error) => {
    logger.error('Failed to start WebSocket cluster consumer', error);
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`New WebSocket connection established: ${socket.id}`);

    connectionManager.addConnection(socket);
    eventRouter.registerHandlers(socket);

    const userId = String(socket.data.user?.id ?? '');
    const lastEventId =
      socket.handshake.auth?.lastEventId ?? socket.handshake.headers['last-event-id'];

    cluster.registerSocket(socket, {
      userId,
      rooms: [`user:${userId}`],
    });

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

    socket.on('room:join', (room: string) => {
      if (typeof room === 'string') {
        cluster.addRoom(socket.id, room);
      }
    });

    socket.on('room:leave', (room: string) => {
      if (typeof room === 'string') {
        cluster.removeRoom(socket.id, room);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${socket.id}. Reason: ${reason}`);
      cluster.unregisterSocket(socket.id);
      connectionManager.removeConnection(socket.id);
    });
  });

  logger.info('WebSocket Server successfully initialized');
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('WebSocket server not initialized!');
  }
  return io;
};
