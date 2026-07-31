import redisClient from '../cache/RedisClient.js';
import logger from '../utils/logger.js';
import prisma from './index.js';

export interface DependencyProbeResult {
  status: 'ready' | 'unavailable';
  latencyMs: number;
  /** Safe, sanitized message. Never includes credentials, connection strings, or stack traces. */
  error?: string;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  checks: {
    database: DependencyProbeResult;
    redis: DependencyProbeResult;
  };
  checkedAt: string;
}

const DEFAULT_READINESS_TIMEOUT_MS = 3000;

function getReadinessTimeoutMs(): number {
  const configured = Number(process.env.HEALTH_READINESS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_READINESS_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`probe timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function checkDatabase(timeoutMs: number): Promise<DependencyProbeResult> {
  const start = Date.now();
  try {
    await withTimeout((prisma as any).$queryRaw`SELECT 1`, timeoutMs);
    return { status: 'ready', latencyMs: Date.now() - start };
  } catch (error) {
    logger.error('Readiness probe: database check failed', error);
    return {
      status: 'unavailable',
      latencyMs: Date.now() - start,
      error: 'database unavailable',
    };
  }
}

async function checkRedis(timeoutMs: number): Promise<DependencyProbeResult> {
  const start = Date.now();
  const client = redisClient.getClient();
  if (!client) {
    logger.warn('Readiness probe: redis client is not connected');
    return {
      status: 'unavailable',
      latencyMs: Date.now() - start,
      error: 'redis unavailable',
    };
  }

  try {
    await withTimeout(client.ping(), timeoutMs);
    return { status: 'ready', latencyMs: Date.now() - start };
  } catch (error) {
    logger.error('Readiness probe: redis check failed', error);
    return {
      status: 'unavailable',
      latencyMs: Date.now() - start,
      error: 'redis unavailable',
    };
  }
}

/**
 * Verifies that the database and Redis are reachable within a bounded timeout.
 *
 * Responses are intentionally sanitized: dependency failures surface a safe
 * message only, while full errors are logged server-side.
 */
export async function checkReadiness(): Promise<ReadinessResult> {
  const timeoutMs = getReadinessTimeoutMs();
  const [database, redis] = await Promise.all([
    checkDatabase(timeoutMs),
    checkRedis(timeoutMs),
  ]);

  const ready = database.status === 'ready' && redis.status === 'ready';

  return {
    status: ready ? 'ready' : 'not_ready',
    checks: { database, redis },
    checkedAt: new Date().toISOString(),
  };
}
