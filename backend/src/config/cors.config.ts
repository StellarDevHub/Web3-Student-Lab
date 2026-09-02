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
  const options: CorsOptions = {
    origin: (origin, callback) => {
      if (origin === 'null') {
        return callback(new Error('Spoofed origin detected'), null as any);
      }

      if (!origin) {
        return callback(null, false);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (allowedPreviewSubdomains.length > 0 && isPreviewSubdomain(origin, allowedPreviewSubdomains)) {
        return callback(null, true);
      }

      logger.warn('CORS origin rejected', {
        origin,
        allowedOrigins,
        allowedPreviewSubdomains,
        env: config.app.env,
      });

      return callback(new Error('Origin not allowed'), null as any);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };

  return cors(options);
}

export function getCorsConfigForLogging() {
  return {
    environment: config.app.env,
    allowedOrigins,
    allowedPreviewSubdomains,
    hasWildcard: false,
  };
}
