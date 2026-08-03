import { Redis } from 'ioredis';
import { getEnvVar } from './checkEnv.js';
import logger from './logger.js';

const redisUrl = getEnvVar('REDIS_URL', 'redis://localhost:6379');

if (!process.env.REDIS_URL) {
  logger.warn('REDIS_URL is not set, defaulting to redis://localhost:6379. Cache will not work if Redis is not running locally.');
}

/**
 * Centralized Redis client exports.
 *
 * This file now re-exports from the singleton RedisClient to eliminate
 * duplicate Redis connections and ensure a single connection manager.
 *
 * @deprecated Import directly from '../cache/RedisClient.js' instead
 */

import redisClient from '../cache/RedisClient.js';

export function getRedisClient() {
  return redisClient.getClient();
}

// Re-export pub/sub clients for BullMQ and WebSocket
export const pubClient = redisClient.getPubClient();
export const subClient = redisClient.getSubClient();

// Default export for backward compatibility
export const redisConnection = getRedisClient();
export default redisConnection;