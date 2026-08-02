import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import cors from 'cors';
import { json } from 'express';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { createGraphQLContext } from './context.js';
import logger from '../utils/logger.js';

export const createGraphQLServer = async () => {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== 'production',
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

export const graphQLMiddleware = async () => {
  const server = await createGraphQLServer();

  return [
    json(),
    cors<cors.CorsRequest>({ origin: true }),
    expressMiddleware(server, {
      context: createGraphQLContext,
    }),
  ];
};
