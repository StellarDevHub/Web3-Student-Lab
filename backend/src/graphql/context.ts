import type { PrismaClient } from '@prisma/client';
import type { IncomingHttpHeaders } from 'http';
import redisClient from '../cache/RedisClient.js';
import { isAccessTokenBlacklisted, verifyAccessToken } from '../auth/token.service.js';
import { createLoaders, type GraphQLLoaders } from './loaders.js';

export type GraphQLUser = {
  id: string;
  role?: string;
  /** Seconds since epoch at which the bearer token stops being valid. */
  exp?: number;
};

export type GraphQLContext = {
  prisma: PrismaClient;
  redis: unknown;
  /** Per-request DataLoaders that batch nested relation lookups. */
  loaders: GraphQLLoaders;
  user?: GraphQLUser | null;
};

/**
 * Verifies an access token (signature, expiry, revocation) and returns the
 * identity it carries, or null. Shared by the HTTP context and the
 * graphql-ws `onConnect` handshake so both transports authenticate alike.
 */
export const resolveUserFromToken = async (rawToken: unknown): Promise<GraphQLUser | null> => {
  if (typeof rawToken !== 'string') return null;
  const token = rawToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const decoded = verifyAccessToken(token) as { userId?: string; id?: string; role?: string; exp?: number };
    const id = decoded.userId ?? decoded.id;
    if (!id || (await isAccessTokenBlacklisted(token))) return null;
    return {
      id,
      ...(decoded.role ? { role: decoded.role } : {}),
      ...(decoded.exp ? { exp: decoded.exp } : {}),
    };
  } catch {
    return null;
  }
};

export const createGraphQLContext = async ({
  req,
}: { req?: { headers?: IncomingHttpHeaders } } = {}): Promise<GraphQLContext> => {
  const prismaModule = await import('../db/index.js');
  // Prefer the fully-extended default client so workspace isolation, read
  // routing and field encryption all apply to loader-driven queries.
  const prisma = (prismaModule.default ?? prismaModule.prisma) as unknown as PrismaClient;
  return {
    prisma,
    redis: redisClient.getClient(),
    loaders: createLoaders(prisma),
    user: await resolveUserFromToken(req?.headers?.authorization),
  };
};
