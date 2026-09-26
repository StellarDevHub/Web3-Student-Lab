import type { PrismaClient } from '@prisma/client';
import redisClient from '../cache/RedisClient.js';
import { createLoaders, type GraphQLLoaders } from './loaders.js';

export type GraphQLContext = {
  prisma: PrismaClient;
  redis: unknown;
  /** Per-request DataLoaders that batch nested relation lookups. */
  loaders: GraphQLLoaders;
  user?: { id: string; email: string; name: string };
};

export const createGraphQLContext = async (): Promise<GraphQLContext> => {
  const prismaModule = await import('../db/index.js');
  // Prefer the fully-extended default client so workspace isolation, read
  // routing and field encryption all apply to loader-driven queries.
  const prisma = (prismaModule.default ?? prismaModule.prisma) as unknown as PrismaClient;
  return {
    prisma,
    redis: redisClient.getClient(),
    loaders: createLoaders(prisma),
  };
};
