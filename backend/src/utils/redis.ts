import dotenv from 'dotenv';
import { Redis } from 'ioredis';

// dotenv.config(); // Skip in Docker Compose - use environment variables instead

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const pubClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const subClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export default redisConnection;
