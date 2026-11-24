import { ApolloServer, type ApolloServerPlugin } from '@apollo/server';
import type { GraphQLSchema } from 'graphql';
import { expressMiddleware } from '@as-integrations/express4';
import { json, type RequestHandler } from 'express';
import cors from 'cors';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { createGraphQLContext } from './context.js';
import { createCorsMiddleware } from '../config/cors.config.js';
import { graphqlQueryComplexityLimiter } from '../middleware/graphqlRateLimiter.js';
import logger from '../utils/logger.js';
import { depthLimitRule, complexityLimitRule } from './validationRules.js';
import config from '../config/env.config.js';

export interface GraphQLServerOptions {
  /** Pre-built executable schema, so HTTP and WebSocket transports share one instance. */
  schema?: GraphQLSchema;
  plugins?: ApolloServerPlugin[];
}

export const createGraphQLServer = async (options: GraphQLServerOptions = {}) => {
  const schemaConfig = options.schema ? { schema: options.schema } : { typeDefs, resolvers };
  const server = new ApolloServer({
    ...schemaConfig,
    introspection: !['production', 'staging'].includes(process.env.NODE_ENV || 'development'),
    validationRules: [
      depthLimitRule(() => config.graphql?.maxDepth ?? 6),
      complexityLimitRule(() => config.graphql?.maxComplexity ?? 500),
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
      ...(options.plugins ?? []),
    ],
  });

  await server.start();

  return server;
};

export const graphQLMiddleware = async (options: GraphQLServerOptions = {}): Promise<RequestHandler[]> => {
  const server = await createGraphQLServer(options);

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
