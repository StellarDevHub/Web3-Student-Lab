/**
 * Centralized Redis client exports.
 *
 * This file now re-exports from the singleton RedisClient to eliminate
 * duplicate Redis connections and ensure a single connection manager.
 *
 * @deprecated Import directly from '../cache/RedisClient.js' instead
 */

import redisClient from '../cache/RedisClient.js';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is required');
}
// Re-export the main client for backward compatibility
export const redisConnection = redisClient.getClient();

export function getRedisClient() {
  return redisClient.getClientOrThrow();
}

// Re-export pub/sub clients for BullMQ and WebSocket
export const pubClient = redisClient.getPubClient();
export const subClient = redisClient.getSubClient();

// Default export for backward compatibility
export default redisConnection;
