import type { PrismaClient } from '@prisma/client';
import redisClient from '../cache/RedisClient.js';

export type GraphQLContext = {
  prisma: PrismaClient;
  redis: unknown;
  user?: { id: string; email: string; name: string };
};

export const createGraphQLContext = async (): Promise<GraphQLContext> => {
  const prismaModule = await import('../db/index.js');
  return {
    prisma: prismaModule.prisma as PrismaClient,
    redis: redisClient.getClient(),
    user: undefined,
  };
};
