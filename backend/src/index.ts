// @ts-nocheck
import cors from 'cors';
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import swaggerUi from 'swagger-ui-express';
import blockHeaderListener from './cache/BlockHeaderListener.js';
import cacheMetrics from './cache/CacheMetrics.js';
import cacheWarmer from './cache/CacheWarmer.js';
import distributedCacheManager from './cache/DistributedCacheManager.js';
import redisClient from './cache/RedisClient.js';
import { rpcCacheHeadersMiddleware, rpcCacheMiddleware } from './cache/RPCInterceptor.js';
import config from './config/env.config.js';
import { setRateLimitEnvOverrides } from './config/rateLimit.config.js';
import { swaggerSpec } from './config/swagger.js';
import prisma from './db/index.js';
import { createGraphQLServer } from './graphql/server.js';
import { scheduleBackupCron, startBackupWorker, stopBackupWorker } from './jobs/backup.worker.js';
import { dbRoutingMiddleware } from './middleware/dbRouting.js';
import { decryptionMiddleware } from './middleware/encryptionMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createI18nMiddleware } from './middleware/i18n.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireWorkspaceMiddleware } from './middleware/WorkspaceContext.js';
import freelanceRoute from './routes/freelance.js';
import routes from './routes/index.js';
import { startWebhookWorker, stopWebhookWorker } from './services/webhooks/index.js';
import logger from './utils/logger.js';
import { getSentryErrorHandler, getSentryRequestHandler, initializeSentry } from './utils/sentry.js';
import { initializeWebSocket } from './websocket/WebSocketServer.js';

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

  startWebhookWorker();

  startBackupWorker();
  scheduleBackupCron().catch((err) => {
    logger.warn('Failed to schedule backup cron:', err);
  });

  logger.info('Distributed caching layer initialized');
}

export const app: express.Application = express();
const httpServer = createServer(app);
const port = config.app.port || 8080;

// Wire rate limit config from environment variables
setRateLimitEnvOverrides({
  'auth-login': {
    burst: { windowMs: 1000, max: config.rateLimiting.loginBurstMax },
    sustained: { windowMs: 60000, max: config.rateLimiting.defaultSustainedMax },
  },
  'auth-register': {
    burst: { windowMs: 1000, max: config.rateLimiting.registerBurstMax },
    sustained: { windowMs: 60000, max: config.rateLimiting.defaultSustainedMax },
  },
  'quiz-submission': {
    burst: { windowMs: 1000, max: config.rateLimiting.quizSubmissionBurstMax },
    sustained: { windowMs: 60000, max: config.rateLimiting.defaultSustainedMax },
  },
  'playground-compile': {
    burst: { windowMs: 1000, max: config.rateLimiting.playgroundCompileBurstMax },
    sustained: { windowMs: 60000, max: config.rateLimiting.defaultSustainedMax },
  },
});

app.use(cors());
app.use(express.json());
app.use(decryptionMiddleware);
app.use(dbRoutingMiddleware);

// Global Rate Limiting - configurable, multi-tier, per-user + per-endpoint
if (config.rateLimiting.enabled) {
  app.use(rateLimiter);
}

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

// GraphQL API endpoint
let graphqlServer: Awaited<ReturnType<typeof createGraphQLServer>> | null = null;

async function setupGraphQL() {
  try {
    graphqlServer = await createGraphQLServer();
    const { expressMiddleware } = await import('@apollo/server/express4');

    app.use(
      '/graphql',
      express.json(),
      cors<cors.CorsRequest>({ origin: true }),
      expressMiddleware(graphqlServer, {
        context: async () => ({ prisma, redis: redisClient.getClient() }),
      })
    );
    logger.info('GraphQL server initialized at /graphql');
  } catch (error) {
    logger.warn('GraphQL server initialization failed:', error);
  }
}

setupGraphQL().catch(() => {});

// API Routes - with workspace isolation
app.use('/api/v1', requireWorkspaceMiddleware, createI18nMiddleware(), routes);

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
    await stopWebhookWorker();
    await stopBackupWorker();
    await distributedCacheManager.gracefulShutdown();

    // Clean up connections
    await redisClient.disconnect();
    await prisma.$disconnect();

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
    await stopWebhookWorker();
    await stopBackupWorker();
    await distributedCacheManager.gracefulShutdown();

    // Clean up connections
    await redisClient.disconnect();
    await prisma.$disconnect();

    server?.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

app.use('/api/freelance', freelanceRoute);
app.use(getSentryErrorHandler());
app.use(errorHandler);
