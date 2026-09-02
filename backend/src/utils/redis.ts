import dotenv from 'dotenv';
import { Redis } from 'ioredis';

// dotenv.config(); // Skip in Docker Compose - use environment variables instead

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const createTestRedisClient = () => {
  const memoryStore = new Map<string, string>();

  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
    quit: async () => undefined,
    ping: async () => 'PONG',
    info: async () => 'test-redis',
    on: () => undefined,
    off: () => undefined,
    get: async (key: string) => memoryStore.get(key) ?? null,
    set: async (key: string, value: string, ...args: any[]) => {
      memoryStore.set(key, value);
      // Handle EX (ttl) option by ignoring it for test purposes
      return 'OK';
    },
    setex: async (key: string, _ttl: number, value: string) => {
      memoryStore.set(key, value);
      return 'OK';
    },
    del: async (...keys: string[]) => {
      keys.forEach((key) => memoryStore.delete(key));
      return keys.length;
    },
    lpush: async (_key: string, ...values: string[]) => values.length,
    brpop: async () => null,
    publish: async (_channel: string, _message: string) => 0,
    keys: async (pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return Array.from(memoryStore.keys()).filter(key => regex.test(key));
    },
    subscribe: (..._args: any[]) => undefined,
  };
};

const createRedisClient = () => {
  if (process.env.NODE_ENV === 'test') {
    return createTestRedisClient() as unknown as Redis;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  client.on('error', (err) => {
    console.warn(`Redis connection error: ${err.message}`);
  });

  return client;
};

export const redisConnection: any = createRedisClient();

export const pubClient: any = createRedisClient();

export const subClient: any = createRedisClient();

export function getRedisClient() {
  return redisConnection;
}

export default redisConnection;
