import { startTracing } from './instrumentation.js';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { createCorsMiddleware } from './config/cors.config.js';
import { securityHeadersMiddleware } from './middleware/securityHeaders.js';
import swaggerDocsRouter from './config/swagger.serve.js';
import { jsonBodySizeLimit } from './middleware/bodySizeLimit.js';
import { dbRoutingMiddleware } from './middleware/dbRouting.js';
import { dynamicRateLimiter } from './middleware/dynamicRateLimiter.js';
import { tracingMiddleware } from './middleware/tracingMiddleware.js';
import apiRouter from './routes/api.js';
import { livenessHandler, readinessHandler } from './routes/health.routes.js';
import routes from './routes/index.js';
import { runStartupMigrations } from './db/startupMigrations.js';
import { startAuditChainJobs } from './jobs/anchorMerkleRootJob.js';
import logger from './utils/logger.js';
import { getSentryErrorHandler, getSentryRequestHandler, initializeSentry } from './utils/sentry.js';

dotenv.config();

export const app = express();
const port = process.env.PORT || 8080;

// Start OpenTelemetry (W3C trace-context, Jaeger export) before serving traffic
void startTracing();

// Initialize Sentry Telemetry and Distributed Tracing
initializeSentry(app);

// OpenTelemetry SERVER span per request; downstream work becomes child spans
app.use(tracingMiddleware());

// Mount Sentry Request Handler middleware
app.use(getSentryRequestHandler());

// Security headers middleware (applied early before route handling)
app.use(securityHeadersMiddleware);

app.use(createCorsMiddleware());

// Contract evaluation submissions carry base64 WASM, so they may use the full
// 1MB body ceiling enforced by jsonBodySizeLimit instead of the 100kb default.
app.use('/api/v1/evaluations', express.json({ limit: '1mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(jsonBodySizeLimit);
// Attach DB routing context middleware to ensure GETs are routed to replicas
app.use(dbRoutingMiddleware);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Health check endpoint for system monitoring
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Web3 Student Lab Backend is running',
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

app.get('/health/live', livenessHandler);
app.get('/health/ready', readinessHandler);

app.post('/api/security/csp-report', express.json(), (req: Request, res: Response) => {
  const report = req.body;
  logger.warn('CSP violation report', {
    report,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(204).end();
});

// Reputation-aware sliding-window rate limiting for every API route.
// Set DYNAMIC_RATE_LIMIT_ENABLED=false to disable.
app.use(
  '/api',
  dynamicRateLimiter({
    skip: () => process.env.NODE_ENV === 'test' || process.env.DYNAMIC_RATE_LIMIT_ENABLED === 'false',
  })
);

// Mount OpenAPI 3.1 interactive docs (Swagger UI) + JSON/YAML spec export.
app.use('/api/docs', swaggerDocsRouter);

// Mount main API v1 router
app.use('/api/v1', routes);

// Mount versioned API routes (e.g. /api/v1/lottery, /api/v2/lottery)
app.use('/api', apiRouter);

// Mount Sentry Error Handler middleware
app.use(getSentryErrorHandler());

if (process.env.NODE_ENV !== 'test') {
  runStartupMigrations()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
      });
      // Routine audit hash-chain verification + Stellar Merkle-root anchoring
      if (process.env.AUDIT_CHAIN_JOBS_ENABLED === 'true') {
        startAuditChainJobs();
      }
    })
    .catch((error) => {
      logger.error('refusing to serve traffic until migrations succeed', error);
      process.exit(1);
    });
}
