import { Request, Response, NextFunction } from 'express';
import cacheService from './CacheService.js';

interface CacheOptions {
  ttl: number;
  keyGenerator?: (req: Request) => string;
}

export const cacheMiddleware = (options: CacheOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = options.keyGenerator
      ? options.keyGenerator(req)
      : `${req.originalUrl || req.url}`;

    try {
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedData);
      }

      res.setHeader('X-Cache', 'MISS');

      const originalJson = res.json.bind(res);
      res.json = function (data: unknown) {
        cacheService.set(cacheKey, data, options.ttl).catch(() => {});
        return originalJson(data);
      };

      next();
    } catch (error) {
      next();
    }
  };
};
