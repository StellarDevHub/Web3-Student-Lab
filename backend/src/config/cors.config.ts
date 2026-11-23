import cors from 'cors';
import type { CorsOptions } from 'cors';
import config from './env.config.js';
import logger from '../utils/logger.js';

function parseOrigins(envValue: string | undefined): string[] {
  if (!envValue) return [];
  return envValue
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function buildAllowedOrigins(): string[] {
  const originEnv = process.env.CORS_ORIGIN || '';

  if (originEnv.trim() !== '') {
    return parseOrigins(originEnv);
  }

  if (config.app.env === 'production') {
    return [];
  }

  if (config.app.env === 'development' || config.app.env === 'test') {
    const devOrigins = parseOrigins(
      process.env.CORS_ALLOWED_DEV_ORIGINS ||
        'http://localhost:3000,http://localhost:5173,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:5173',
    );
    return devOrigins;
  }

  return [];
}

function isPreviewSubdomain(origin: string, subdomains: string[]): boolean {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return subdomains.some((sub) => hostname === sub || hostname.endsWith(`.${sub}`));
  } catch {
    return false;
  }
}

const allowedOrigins = buildAllowedOrigins();
const allowedPreviewSubdomains = parseOrigins(
  process.env.CORS_ALLOWED_PREVIEW_SUBDOMAINS || ''
);

export function createCorsMiddleware(): (req: any, res: any, next: any) => void {
  const corsHandler = cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, false);
      }

      const origins = buildAllowedOrigins();
      const previewSubdomains = parseOrigins(
        process.env.CORS_ALLOWED_PREVIEW_SUBDOMAINS || ''
      );

      if (origins.includes(origin)) {
        return callback(null, true);
      }

      if (previewSubdomains.length > 0 && isPreviewSubdomain(origin, previewSubdomains)) {
        return callback(null, true);
      }

      logger.warn('CORS origin rejected', {
        origin,
        allowedOrigins: origins,
        allowedPreviewSubdomains: previewSubdomains,
        env: config.app.env,
      });

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  return (req: any, res: any, next: any) => {
    if (req.headers && req.headers.origin === 'null') {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    return corsHandler(req, res, next);
  };
}

export function getCorsConfigForLogging() {
  return {
    environment: config.app.env,
    allowedOrigins,
    allowedPreviewSubdomains,
    hasWildcard: false,
  };
}
