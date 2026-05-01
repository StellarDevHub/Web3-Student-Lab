import freelanceRoute from './routes/freelance';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import prisma from './db/index.js';
import { dbRoutingMiddleware } from './middleware/dbRouting.js';
import { requestLogger } from './middleware/requestLogger.js';
import routes from './routes/index.js';
import { validateEnvironment } from './utils/checkEnv.js';
import logger from './utils/logger.js';
import { initializeWebSocket } from './websocket/WebSocketServer.js';

// Load environment variables
dotenv.config();

// Validate environment variables before starting the application
// Skip validation in test environment as tests may override environment variables
if (process.env.NODE_ENV !== 'test') {
  validateEnvironment();
}

// Initialize Redis connection
if (process.env.NODE_ENV !== 'test') {
  redisClient.connect().catch((err) => {
    logger.warn('Redis connection failed, continuing without cache:', err);
  });
}

import { decryptionMiddleware } from './middleware/encryptionMiddleware.js';

export const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // In production, replace with actual frontend URL
    methods: ['GET', 'POST'],
  },
});

const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(decryptionMiddleware);
app.use(dbRoutingMiddleware);

// Initialize WebSocket Gateway
initWebSocketGateway(io);

// Global Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

// Global Rate Limiting - now using sliding window
app.use(apiRateLimiter);
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Web3 Student Lab Backend is running',
    uptime: process.uptime(),
    version: '1.0.0',
    redis: redisClient.isHealthy() ? 'connected' : 'disconnected',
  });
});

import { requireWorkspaceMiddleware } from './middleware/WorkspaceContext.js';

// Cache metrics endpoint
app.use('/api/v1/cache', cacheMetrics);

// API Routes - with workspace isolation
app.use('/api/v1', requireWorkspaceMiddleware, routes);

// Start server only if not in test environment
let server: ReturnType<typeof httpServer.listen> | null = null;

if (process.env.NODE_ENV !== 'test') {
  server = httpServer.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
  });

  initializeWebSocket(server);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    await redisClient.disconnect();
    await prisma.$disconnect();
    await Promise.all([
      redisConnection.quit(),
      pubClient.quit(),
      subClient.quit(),
    ]);
    server?.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully...');
    await redisClient.disconnect();
    await prisma.$disconnect();
    await Promise.all([
      redisConnection.quit(),
      pubClient.quit(),
      subClient.quit(),
    ]);
    server?.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

app.use('/api/freelance', freelanceRoute);
