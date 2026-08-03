import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { json } from 'express';
import cors from 'cors';
import { json, type RequestHandler } from 'express';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { createGraphQLContext } from './context.js';
import { createCorsMiddleware } from '../config/cors.config.js';
import { graphqlQueryComplexityLimiter } from '../middleware/graphqlRateLimiter.js';
import logger from '../utils/logger.js';
import { depthLimitRule, complexityLimitRule } from './validationRules.js';
import config from '../config/env.config.js';

export const createGraphQLServer = async () => {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== 'production',
    validationRules: [
      depthLimitRule(() => config.graphql?.maxDepth ?? 10),
      complexityLimitRule(() => config.graphql?.maxComplexity ?? 100),
    ],
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              logger.info('GraphQL server shutting down');
            },
          };
        },
      },
    ],
  });

  await server.start();

  return server;
};

export const graphQLMiddleware = async (): Promise<RequestHandler[]> => {
  const server = await createGraphQLServer();

  return [
    json(),
    cors<cors.CorsRequest>({ origin: true }),
    graphqlQueryComplexityLimiter,
    createCorsMiddleware(),
    expressMiddleware(server, {
      context: createGraphQLContext,
    }) as RequestHandler,
  ];
};
