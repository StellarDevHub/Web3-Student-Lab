import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import logger from '../utils/logger.js';
import { socketAuthMiddleware } from './middleware/auth.middleware.js';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware.js';
import { ConnectionManager } from './ConnectionManager.js';
import { EventRouter } from './EventRouter.js';

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

  io.on('connection', (socket: Socket) => {
    logger.info(`New WebSocket connection established: ${socket.id}`);

    connectionManager.addConnection(socket);
    eventRouter.registerHandlers(socket);

    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${socket.id}. Reason: ${reason}`);
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
