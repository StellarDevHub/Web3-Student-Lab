import cors from 'cors';
import express, { Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import blockHeaderListener from './cache/BlockHeaderListener.js';
import cacheMetrics from './cache/CacheMetrics.js';
import cacheWarmer from './cache/CacheWarmer.js';
import distributedCacheManager from './cache/DistributedCacheManager.js';
import redisClient from './cache/RedisClient.js';
import { rpcCacheHeadersMiddleware, rpcCacheMiddleware } from './cache/RPCInterceptor.js';
import prisma from './db/index.js';
import { dbRoutingMiddleware } from './middleware/dbRouting.js';
import { decryptionMiddleware } from './middleware/encryptionMiddleware.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireWorkspaceMiddleware } from './middleware/WorkspaceContext.js';
import freelanceRoute from './routes/freelance.js';
import routes from './routes/index.js';
import { validateEnvironment } from './utils/checkEnv.js';
import logger from './utils/logger.js';
import { pubClient, redisConnection, subClient } from './utils/redis.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import config from './config/env.config.js';
import { initializeWebSocket } from './websocket/WebSocketServer.js';
import { initializeSentry, getSentryErrorHandler, getSentryRequestHandler } from './utils/sentry.js';
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
// dotenv.config(); // Skip in Docker Compose - use environment variables instead

// Validate environment variables before starting the application
// Skip validation in test environment as tests may override environment variables
// Note: validation is now also triggered during config module load
if (config.app.env !== 'test') {
  logger.info('Application Configuration Loaded', config.getSafeConfig());
}

// Initialize Sentry if configured
initializeSentry();

// Initialize Redis connection
if (config.app.env !== 'test') {
  redisClient.connect().catch((err) => {
    logger.warn('Redis connection failed, continuing without cache:', err);
  });

  // Initialize distributed caching components
  blockHeaderListener.start().catch((err) => {
    logger.warn('BlockHeaderListener failed to start:', err);
  });

  cacheWarmer.start().catch((err) => {
    logger.warn('CacheWarmer failed to start:', err);
  });

  logger.info('Distributed caching layer initialized');
}

export const app: express.Application = express();
const httpServer = createServer(app);
const port = config.app.port || 8080;

app.use(cors());
app.use(express.json());
app.use(decryptionMiddleware);
app.use(dbRoutingMiddleware);

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
app.use(limiter);
app.use(requestLogger);
app.use(getSentryRequestHandler());

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API and its dependencies
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Web3 Student Lab Backend is running
 *                 uptime:
 *                   type: number
 *                   example: 123.45
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 redis:
 *                   type: string
 *                   example: connected
 */
// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Web3 Student Lab Backend is running',
    uptime: process.uptime(),
    version: '1.0.0',
    redis: redisClient.isHealthy() ? 'connected' : 'disconnected',
    redisMode: redisClient.getMode(),
    blockHeaderListener: blockHeaderListener.getStatus(),
    cacheWarmer: cacheWarmer.getStatus(),
  });
});

// Cache metrics endpoint
app.use('/api/v1/cache', cacheMetrics);

// RPC caching middleware for Soroban calls
// This middleware intercepts and caches RPC method calls
app.use('/api/rpc', rpcCacheHeadersMiddleware);
app.use('/api/rpc', rpcCacheMiddleware);

// API Routes - with workspace isolation
app.use('/api/v1', requireWorkspaceMiddleware, routes);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Web3 Student Lab API Documentation'
}));

// Start server only if not in test environment
let server: ReturnType<typeof httpServer.listen> | null = null;

if (config.app.env !== 'test') {
  server = httpServer.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
  });

  initializeWebSocket(server);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');

    // Stop cache components
    blockHeaderListener.stop();
    cacheWarmer.stop();
    await distributedCacheManager.gracefulShutdown();

    // Clean up connections
    await redisClient.disconnect();
    await prisma.$disconnect();
    await Promise.all([redisConnection.quit(), pubClient.quit(), subClient.quit()]);

    server?.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully...');

    // Stop cache components
    blockHeaderListener.stop();
    cacheWarmer.stop();
    await distributedCacheManager.gracefulShutdown();

    // Clean up connections
    await redisClient.disconnect();
    await prisma.$disconnect();
    await Promise.all([redisConnection.quit(), pubClient.quit(), subClient.quit()]);

    server?.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

app.use('/api/freelance', freelanceRoute);
app.use(getSentryErrorHandler());
app.use(errorHandler);
