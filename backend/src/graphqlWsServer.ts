/**
 * GraphQL over WebSocket server — BE-007
 *
 * Serves the full schema over two transports from one HTTP server:
 *   - HTTP POST /graphql → Apollo Server (queries & mutations)
 *   - WS /graphql        → graphql-ws (subscriptions; queries/mutations too)
 *
 * Both transports share one executable schema, so the subscription resolvers
 * in `graphql/resolvers/subscriptionResolvers.ts` are live on either.
 *
 * Connection lifecycle:
 *   - Authentication: `connection_init` must carry a JWT access token in
 *     `connectionParams.authorization` (or `.token`). Missing, invalid,
 *     expired or revoked tokens are rejected with close code 4403 before any
 *     operation is accepted; sockets that never send `connection_init` are
 *     closed after `connectionInitWaitTimeout`.
 *   - Token expiry: an authenticated socket is closed with 4401 when its
 *     token expires, so a revoked session cannot keep listening forever.
 *   - Liveness: the server pings every `keepAliveMs` and terminates sockets
 *     that stop answering, which in turn fires `onClose`.
 *   - Cleanup: on `complete` or socket close graphql-ws calls `return()` on
 *     every active subscription iterator, which unregisters its pub/sub
 *     listener immediately (see graphql/pubsub.ts).
 *
 * Run standalone with `npm run collab:graphql`.
 */

import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import { execute, subscribe, validate, type ExecutionArgs, type GraphQLSchema } from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocketServer } from 'ws';
import config from './config/env.config.js';
import { resolveUserFromToken, type GraphQLUser } from './graphql/context.js';
import { resolvers } from './graphql/resolvers.js';
import { typeDefs } from './graphql/schema.js';
import { graphQLMiddleware } from './graphql/server.js';
import { complexityLimitRule, depthLimitRule } from './graphql/validationRules.js';
import logger from './utils/logger.js';

const MAX_DEPTH = config.graphql?.maxDepth ?? 6;
const MAX_COMPLEXITY = config.graphql?.maxComplexity ?? 500;

/** Close codes (4400-4499 are reserved by graphql-ws for application use). */
export const WS_CLOSE_UNAUTHORIZED = 4403;
export const WS_CLOSE_TOKEN_EXPIRED = 4401;

export interface GraphqlWsServerOptions {
  port?: number;
  /** Ping interval used to detect and drop dead sockets. */
  keepAliveMs?: number;
  /** How long a socket may stay open without sending `connection_init`. */
  connectionInitWaitTimeoutMs?: number;
  schema?: GraphQLSchema;
}

export interface GraphqlWsServerHandle {
  httpServer: http.Server;
  wsServer: WebSocketServer;
  port: number;
  stats: () => { connections: number; sockets: number };
  close: () => Promise<void>;
}

type ConnectionExtra = { user: GraphQLUser; expiryTimer: NodeJS.Timeout };

export const buildExecutableSchema = () => makeExecutableSchema({ typeDefs, resolvers });

/**
 * graphql-ws calls `execute`/`subscribe` directly, bypassing Apollo's
 * validation rules. Validate first so the WS path enforces the same depth and
 * complexity caps as the HTTP path (#1424 / BE-HARD-33).
 */
const withValidationRules = (runner: (args: ExecutionArgs) => any) => (args: ExecutionArgs) => {
  const errors = validate(args.schema, args.document, [
    depthLimitRule(() => MAX_DEPTH),
    complexityLimitRule(() => MAX_COMPLEXITY),
  ]);
  if (errors.length > 0) return { errors };
  return runner(args);
};

export async function createGraphqlWsServer(options: GraphqlWsServerOptions = {}): Promise<GraphqlWsServerHandle> {
  const schema = options.schema ?? buildExecutableSchema();
  const app = express();
  const httpServer = http.createServer(app);
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql', maxPayload: 64 * 1024 });

  let connections = 0;

  const serverCleanup = useServer<Record<string, unknown>, ConnectionExtra>(
    {
      schema,
      execute: withValidationRules(execute),
      subscribe: withValidationRules(subscribe),
      connectionInitWaitTimeout: options.connectionInitWaitTimeoutMs ?? 5_000,
      context: (ctx) => ({ user: ctx.extra.user ?? null }),
      onConnect: async (ctx) => {
        const params = ctx.connectionParams ?? {};
        const user = await resolveUserFromToken(params.authorization ?? params.token);
        if (!user) {
          // Returning false closes the socket with 4403 Forbidden.
          return false;
        }
        ctx.extra.user = user;
        if (user.exp) {
          const msUntilExpiry = user.exp * 1000 - Date.now();
          ctx.extra.expiryTimer = setTimeout(() => {
            ctx.extra.socket.close(WS_CLOSE_TOKEN_EXPIRED, 'Token expired');
          }, Math.max(0, msUntilExpiry));
          ctx.extra.expiryTimer.unref?.();
        }
        connections++;
        return true;
      },
      onClose: (ctx, code, reason) => {
        if (ctx.extra.expiryTimer) clearTimeout(ctx.extra.expiryTimer);
        if (ctx.extra.user) {
          connections = Math.max(0, connections - 1);
          logger.debug?.('[graphql-ws] connection closed', { userId: ctx.extra.user.id, code, reason });
        }
      },
      onError: (_ctx, id, _payload, errors) => {
        logger.warn('[graphql-ws] operation error', { id, errors: errors.map((e) => e.message) });
      },
    },
    wsServer,
    options.keepAliveMs ?? 12_000
  );

  const graphqlHandlers = await graphQLMiddleware({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  const openSockets = () => {
    let total = 0;
    for (const client of wsServer.clients) {
      if (client.readyState === client.OPEN) total++;
    }
    return total;
  };

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', connections, sockets: openSockets() });
  });
  app.use('/graphql', ...graphqlHandlers);

  await new Promise<void>((resolve) => httpServer.listen(options.port ?? 0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    httpServer,
    wsServer,
    port,
    stats: () => ({ connections, sockets: openSockets() }),
    close: async () => {
      await serverCleanup.dispose();
      for (const client of wsServer.clients) client.terminate();
      await new Promise<void>((resolve) => wsServer.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

const isEntrypoint = /graphqlWsServer\.(ts|js)$/.test(process.argv[1] ?? '');

if (isEntrypoint) {
  const port = Number(process.env.PORT || process.env.WS_PORT || 4001);
  createGraphqlWsServer({ port })
    .then((server) => {
      logger.info(`GraphQL HTTP + WS server listening on ${server.port}`);
      const shutdown = () => {
        server.close().finally(() => process.exit(0));
      };
      process.once('SIGTERM', shutdown);
      process.once('SIGINT', shutdown);
    })
    .catch((err) => {
      logger.error('Failed to start GraphQL WS server', err);
      process.exit(1);
    });
}
