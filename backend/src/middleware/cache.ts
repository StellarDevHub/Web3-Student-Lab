import { Request, Response, NextFunction } from 'express';
import { redisConnection } from '../utils/redis.js';

// Cache middleware factory
export const cacheMiddleware = (ttlSeconds: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      const cacheKey = `cache:${req.originalUrl}:${req.user?.id || 'anonymous'}`;
      const cachedData = await redisConnection.get(cacheKey);

      if (cachedData) {
        const data = JSON.parse(cachedData);
        return res.status(200).json(data);
      }

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data: any) {
        // Only cache successful responses
        if (res.statusCode === 200) {
          redisConnection.setex(cacheKey, ttlSeconds, JSON.stringify(data)).catch(err => {
            console.error('Cache set error:', err);
          });
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next(); // Continue without caching if there's an error
    }
  };
};
