
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { createCorsMiddleware } from './config/cors.config.js';
import swaggerDocsRouter from './config/swagger.serve.js';
import logger from './utils/logger.js';
import { getSentryErrorHandler, getSentryRequestHandler, initializeSentry } from './utils/sentry.js';


dotenv.config();

export const app = express();
const port = process.env.PORT || 8080;

// Initialize Sentry Telemetry and Distributed Tracing
initializeSentry(app);

// Mount Sentry Request Handler middleware
app.use(getSentryRequestHandler());

app.use(createCorsMiddleware());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(jsonBodySizeLimit);
// Attach DB routing context middleware to ensure GETs are routed to replicas
app.use(dbRoutingMiddleware);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Web3 Student Lab Backend is running' });
});

app.post('/api/security/csp-report', express.json(), (req: Request, res: Response) => {
  const report = req.body;
  logger.warn('CSP violation report', {
    report,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(204).end();
});

// Mount OpenAPI 3.1 interactive docs (Swagger UI) + JSON/YAML spec export.
app.use('/api/docs', swaggerDocsRouter);

// Mount main API v1 router
app.use('/api/v1', routes);

// Mount Sentry Error Handler middleware
app.use(getSentryErrorHandler());

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
