import express from 'express';
import { buildSchema, execute, subscribe } from 'graphql';
import { useServer } from 'graphql-ws/lib/use/ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import { typeDefs } from './graphql/schema.js';
import { graphQLMiddleware } from './graphql/server.js';

const PORT = Number(process.env.PORT || process.env.WS_PORT || 4001);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

class PubSub {
  private events = new Map<string, Set<(payload: any) => void>>();

  publish(topic: string, payload: any) {
    const subs = this.events.get(topic);
    if (!subs) return;
    for (const cb of subs) cb(payload);
  }

  subscribe(topic: string) {
    const set = this.events.get(topic) ?? new Set();
    this.events.set(topic, set);
    const queue: any[] = [];
    let pullResolve: ((v: IteratorResult<any>) => void) | null = null;

    const push = (value: any) => {
      if (pullResolve) {
        pullResolve({ value, done: false });
        pullResolve = null;
      } else {
        queue.push(value);
      }
    };

    const cb = (payload: any) => push(payload);
    set.add(cb);

    const asyncIterator = {
      async next() {
        if (queue.length) return { value: queue.shift(), done: false };
        return await new Promise<IteratorResult<any>>(res => (pullResolve = res));
      },
      return() {
        set.delete(cb);
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error: any) {
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    return asyncIterator;
  }
}

const pubsub = new PubSub();

const schema = buildSchema(typeDefs);

const rootValue: Record<string, any> = {
  courseUpdated: ({ courseId }: { courseId: string }) => pubsub.subscribe(`course:${courseId}`),
};

const app = express();

app.get('/health', (_req, res) => res.status(200).send('ok'));

(async () => {
  const graphqlHandlers = await graphQLMiddleware();
  // mount middleware array returned by graphQLMiddleware at /graphql
  app.use('/graphql', ...graphqlHandlers);

  const server = http.createServer(app);

  const wsServer = new WebSocketServer({ server, path: '/graphql' });

  // per-client backpressure queue limit
  const QUEUE_LIMIT = 32;

  useServer(
    {
      schema,
      execute,
      subscribe,
      rootValue,
      onConnect: async (ctx) => {
        const connectionParams = (ctx.connectionParams || {}) as Record<string, any>;
        const token = (connectionParams.authorization || connectionParams.token || '').replace(/^Bearer\s+/i, '');
        if (!token) throw new Error('Missing auth token');
        try {
          const user = jwt.verify(token, JWT_SECRET);
          return { user };
        } catch (err) {
          throw new Error('Unauthorized');
        }
      },
      onSubscribe: async (ctx, msg) => {
        // multiplexing: allow clients to subscribe to different rooms via variables
        return msg.payload;
      },
      onNext: (ctx, msg, args) => {
        // no-op: handled by graphql execution
      },
      onUnhandledError: (ctx, err) => {
        console.error('WS error', err);
      },
      onClose: (ctx, code, reason) => {
        // cleanup handled by graphql-ws
      },
      // customize sending to add backpressure dropping stale frames
      sendMessage: (socket, message) => {
        // attach a small queue on the socket
        const qSymbol = Symbol.for('gqlws_queue');
        // @ts-ignore
        if (!socket[qSymbol]) socket[qSymbol] = [];
        // @ts-ignore
        const q = socket[qSymbol] as any[];
        q.push(message);
        if (q.length > QUEUE_LIMIT) {
          // drop oldest
          q.shift();
        }
        // if socket is ready, flush
        // @ts-ignore
        if (socket.readyState === socket.OPEN) {
          // flush all
          // @ts-ignore
          while (q.length) socket.send(JSON.stringify(q.shift()));
        }
        return Promise.resolve();
      },
    },
    wsServer
  );

  server.listen(PORT, () => console.log(`GraphQL WS server listening on ${PORT}`));

  // expose a tiny API to publish to rooms (used by other parts of the app)
  app.post('/publish/:room', express.json(), (req, res) => {
    const room = req.params.room;
    pubsub.publish(room, req.body.payload ?? req.body);
    res.status(204).end();
  });
})();

export { };
