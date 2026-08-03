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

const allowedOrigins = buildAllowedOrigins();

export function createCorsMiddleware(): (req: any, res: any, next: any) => void {
  const options: CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        if (allowedOrigins.length > 0) {
          return callback(null, false);
        }
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      logger.warn('CORS origin rejected', {
        origin,
        allowedOrigins,
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
  };

  return cors(options);
}

export function getCorsConfigForLogging() {
  return {
    environment: config.app.env,
    allowedOrigins,
    hasWildcard: allowedOrigins.length === 0,
  };
}
