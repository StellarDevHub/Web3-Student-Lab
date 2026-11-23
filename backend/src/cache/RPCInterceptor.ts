import { NextFunction, Request, Response } from 'express';
import { cacheTTL } from '../config/redis.config.js';
import logger from '../utils/logger.js';
import cacheService from './CacheService.js';

/**
 * Cache key generator for RPC requests
 */
function generateRPCCacheKey(method: string, params: any[]): string {
  // Create a deterministic hash of the request
  const paramsStr = JSON.stringify(params).substring(0, 200); // Limit param length
  return `rpc:${method}:${paramsStr}`;
}

/**
 * Check if an RPC method should be cached
 */
function shouldCacheRPCMethod(method: string): boolean {
  const cacheable = [
    'soroban_getContractData',
    'soroban_getAccount',
    'soroban_getBalance',
    'soroban_getLatestLedger',
    'soroban_getTransaction',
    'soroban_getEvents',
  ];
  return cacheable.includes(method);
}

/**
 * Get appropriate TTL for RPC method
 */
function getRPCMethodTTL(method: string): number {
  const ttlMap: Record<string, number> = {
    soroban_getLatestLedger: cacheTTL.blockchain.blockHeader,
    soroban_getAccount: cacheTTL.blockchain.accountBalance,
    soroban_getBalance: cacheTTL.blockchain.accountBalance,
    soroban_getContractData: cacheTTL.blockchain.contractState,
    soroban_getTransaction: cacheTTL.blockchain.transactionStatus,
    soroban_getEvents: cacheTTL.blockchain.transactionStatus,
  };
  return ttlMap[method] || cacheTTL.rpc.methodResponse;
}

/**
 * Middleware to cache RPC method calls
 * This interceptor sits between the client and the RPC endpoint
 * Dramatically reduces load on RPC nodes by serving cached responses
 */
export const rpcCacheMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Only cache POST requests (JSON-RPC)
  if (req.method !== 'POST') {
    return next();
  }

  const body = req.body as any;

  // Validate JSON-RPC format
  if (!body.method || !Array.isArray(body.params)) {
    return next();
  }

  const { method, params, id } = body;

  // Skip non-cacheable methods
  if (!shouldCacheRPCMethod(method)) {
    return next();
  }

  const cacheKey = generateRPCCacheKey(method, params);
  const ttl = getRPCMethodTTL(method);

  // Try to get from cache
  cacheService
    .get(cacheKey)
    .then(async (cachedResult) => {
      if (cachedResult) {
        logger.debug(`RPC cache HIT for ${method}`);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-RPC-Method', method);

        // Return cached result in JSON-RPC format
        return res.json({
          jsonrpc: '2.0',
          id,
          result: cachedResult,
          _cached: true,
          _cachedAt: new Date().toISOString(),
        });
      }

      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-RPC-Method', method);

      // Intercept the response
      const originalJson = res.json.bind(res);
      res.json = function (data: any) {
        // Cache the result if it's a successful response
        if (data && data.result && !data.error) {
          cacheService.set(cacheKey, data.result, ttl).catch((err) => {
            logger.error(`Failed to cache RPC result for ${method}:`, err);
          });
        }

        return originalJson(data);
      };

      next();
    })
    .catch((error) => {
      logger.error(`Error in RPC cache middleware:`, error);
      next();
    });
};

/**
 * Middleware to add cache control headers for RPC responses
 */
export const rpcCacheHeadersMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Set cache control headers based on method
  const body = req.body as any;
  if (body?.method) {
    const ttl = getRPCMethodTTL(body.method);
    res.setHeader('Cache-Control', `private, max-age=${ttl}`);
  }
  next();
};

/**
 * Utility to manually invalidate specific RPC cache entries
 */
export async function invalidateRPCCache(
  method: string,
  params?: any[]
): Promise<void> {
  if (params) {
    const cacheKey = generateRPCCacheKey(method, params);
    await cacheService.del(cacheKey);
    logger.info(`Invalidated RPC cache for ${method}`);
  } else {
    // Invalidate all entries for this method
    await cacheService.delPattern(`rpc:${method}:*`);
    logger.info(`Invalidated all RPC cache entries for ${method}`);
  }
}

/**
 * Clear all RPC caches
 */
export async function clearAllRPCCache(): Promise<void> {
  await cacheService.delPattern('rpc:*');
  logger.info('Cleared all RPC caches');
}
