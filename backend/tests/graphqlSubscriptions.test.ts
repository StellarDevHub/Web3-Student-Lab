import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { performance } from 'perf_hooks';
import WebSocket from 'ws';
import { createClient, type Client } from 'graphql-ws';

/**
 * BE-007: GraphQL subscriptions over graphql-ws — JWT auth on connect,
 * per-subscription authorization, sub-50ms push and listener cleanup.
 */

jest.mock('../src/db/index.js', () => ({ __esModule: true, default: {}, prisma: {} }));
jest.mock('../src/cache/RedisClient.js', () => ({ __esModule: true, default: { getClient: () => null } }));
jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const SECRET = 'graphql-ws-test-secret';
process.env.ACCESS_TOKEN_SECRET = SECRET;

import { createGraphqlWsServer, WS_CLOSE_UNAUTHORIZED, type GraphqlWsServerHandle } from '../src/graphqlWsServer.js';
import {
  publishCourseProgress,
  publishExerciseStatus,
  PubSub,
  pubsub,
  SUBSCRIBER_BUFFER_LIMIT,
  topics,
} from '../src/graphql/pubsub.js';

jest.setTimeout(20_000);

const sign = (claims: Record<string, unknown>, options: jwt.SignOptions = { expiresIn: '15m' }) =>
  jwt.sign(claims, SECRET, options);

const studentToken = sign({ userId: 'student-1' });
const otherStudentToken = sign({ userId: 'student-2' });
const adminToken = sign({ userId: 'admin-1', role: 'admin' });

const waitFor = async (predicate: () => boolean, timeoutMs = 3_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('PubSub', () => {
  it('delivers to matching subscribers and stops after return()', async () => {
    const bus = new PubSub();
    const it1 = bus.subscribe<{ n: number }>('t');
    bus.publish('t', { n: 1 });
    await expect(it1.next()).resolves.toEqual({ value: { n: 1 }, done: false });

    expect(bus.listenerCount('t')).toBe(1);
    await it1.return();
    expect(bus.listenerCount('t')).toBe(0);
    await expect(it1.next()).resolves.toMatchObject({ done: true });
  });

  it('applies the per-subscriber filter', async () => {
    const bus = new PubSub();
    const iterator = bus.subscribe<{ owner: string }>('t', (p) => p.owner === 'me');
    bus.publish('t', { owner: 'you' });
    bus.publish('t', { owner: 'me' });
    await expect(iterator.next()).resolves.toEqual({ value: { owner: 'me' }, done: false });
    await iterator.return();
  });

  it('bounds the buffer of a slow subscriber by dropping the oldest events', async () => {
    const bus = new PubSub();
    const iterator = bus.subscribe<number>('t');
    for (let i = 0; i < SUBSCRIBER_BUFFER_LIMIT + 10; i++) bus.publish('t', i);
    await expect(iterator.next()).resolves.toEqual({ value: 10, done: false });
    await iterator.return();
  });

  it('resolves a pending next() when the subscription is closed', async () => {
    const bus = new PubSub();
    const iterator = bus.subscribe('t');
    const pending = iterator.next();
    await iterator.return();
    await expect(pending).resolves.toMatchObject({ done: true });
  });
});

describe('graphql-ws server', () => {
  let server: GraphqlWsServerHandle;
  let url: string;
  const clients: Client[] = [];

  const connect = (token?: string, closed?: (event: unknown) => void) => {
    const client = createClient({
      url,
      webSocketImpl: WebSocket,
      retryAttempts: 0,
      lazy: true,
      connectionParams: token ? { authorization: `Bearer ${token}` } : {},
      ...(closed ? { on: { closed } } : {}),
    });
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    server = await createGraphqlWsServer({ port: 0, keepAliveMs: 1_000 });
    url = `ws://127.0.0.1:${server.port}/graphql`;
  });

  afterAll(async () => {
    await Promise.allSettled(clients.map((c) => c.dispose()));
    await server.close();
  });

  const EXERCISE_SUB = `subscription ($studentId: ID!) {
    exerciseStatusUpdated(studentId: $studentId) { studentId exerciseId status gasUsed passed total tests { name status } emittedAt }
  }`;

  it('rejects connections without a JWT', async () => {
    let closeCode: number | undefined;
    const client = connect(undefined, (event) => {
      closeCode = (event as { code: number }).code;
    });
    const iterator = client.iterate({ query: EXERCISE_SUB, variables: { studentId: 'student-1' } });
    await expect(iterator.next()).rejects.toBeDefined();
    expect(closeCode).toBe(WS_CLOSE_UNAUTHORIZED);
  });

  it('rejects connections with a forged or expired JWT', async () => {
    const forged = jwt.sign({ userId: 'student-1' }, 'wrong-secret');
    const expired = sign({ userId: 'student-1', exp: Math.floor(Date.now() / 1000) - 60 }, {});
    for (const token of [forged, expired]) {
      let closeCode: number | undefined;
      const client = connect(token, (event) => {
        closeCode = (event as { code: number }).code;
      });
      const iterator = client.iterate({ query: EXERCISE_SUB, variables: { studentId: 'student-1' } });
      await expect(iterator.next()).rejects.toBeDefined();
      expect(closeCode).toBe(WS_CLOSE_UNAUTHORIZED);
    }
  });

  it('pushes exerciseStatusUpdated to the subscribed student in under 50ms', async () => {
    const client = connect(studentToken);
    const iterator = client.iterate({ query: EXERCISE_SUB, variables: { studentId: 'student-1' } });
    const first = iterator.next();
    await waitFor(() => pubsub.listenerCount(topics.exerciseStatus('student-1')) === 1);

    const latencies: number[] = [];
    let next = first;
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      publishExerciseStatus({
        studentId: 'student-1',
        exerciseId: 'ex-1',
        status: 'PASSED',
        gasUsed: 752,
        passed: 1,
        total: 1,
        tests: [{ name: 'adds', status: 'passed', gasUsed: 752, durationMs: 0.1 }],
      });
      const { value } = await next;
      latencies.push(performance.now() - started);
      expect((value as any).data.exerciseStatusUpdated).toMatchObject({
        studentId: 'student-1',
        status: 'PASSED',
        gasUsed: 752,
        tests: [{ name: 'adds', status: 'passed' }],
      });
      next = iterator.next();
    }

    expect(Math.max(...latencies)).toBeLessThan(50);
    await iterator.return?.();
  });

  it("forbids subscribing to another student's exercise updates", async () => {
    const client = connect(otherStudentToken);
    const iterator = client.iterate({ query: EXERCISE_SUB, variables: { studentId: 'student-1' } });
    const { value } = await iterator.next();
    expect((value as any).errors[0]).toMatchObject({
      message: expect.stringMatching(/own/),
      extensions: { code: 'FORBIDDEN' },
    });
    expect(pubsub.listenerCount(topics.exerciseStatus('student-1'))).toBe(0);
  });

  it('lets admins subscribe to any student', async () => {
    const client = connect(adminToken);
    const iterator = client.iterate({ query: EXERCISE_SUB, variables: { studentId: 'student-1' } });
    const next = iterator.next();
    await waitFor(() => pubsub.listenerCount(topics.exerciseStatus('student-1')) === 1);
    publishExerciseStatus({ studentId: 'student-1', exerciseId: 'ex-2', status: 'RUNNING' });
    await expect(next).resolves.toMatchObject({ value: { data: { exerciseStatusUpdated: { status: 'RUNNING' } } } });
    await iterator.return?.();
  });

  it('only sends a student their own courseProgressChanged events', async () => {
    const query = `subscription { courseProgressChanged(courseId: "course-1") { studentId percentage } }`;
    const client = connect(studentToken);
    const iterator = client.iterate({ query });
    const next = iterator.next();
    await waitFor(() => pubsub.listenerCount(topics.courseProgress('course-1')) === 1);

    const base = { courseId: 'course-1', status: 'in_progress', completedLessons: ['l1'] };
    publishCourseProgress({ ...base, studentId: 'student-2', percentage: 90 });
    publishCourseProgress({ ...base, studentId: 'student-1', percentage: 10 });

    await expect(next).resolves.toMatchObject({
      value: { data: { courseProgressChanged: { studentId: 'student-1', percentage: 10 } } },
    });
    await iterator.return?.();
  });

  it('broadcasts admin announcements to every subscriber and blocks non-admin publishers', async () => {
    const listener = connect(studentToken);
    const iterator = listener.iterate({ query: `subscription { newGlobalAnnouncement { title severity publishedBy } }` });
    const next = iterator.next();
    await waitFor(() => pubsub.listenerCount(topics.announcements()) === 1);

    const mutation = `mutation { publishGlobalAnnouncement(input: { title: "Maintenance", message: "Tonight 22:00 UTC", severity: WARNING }) { id } }`;

    const denied = await connect(studentToken).iterate({ query: mutation }).next();
    expect((denied.value as any).errors[0].extensions.code).toBe('FORBIDDEN');

    const published = await connect(adminToken).iterate({ query: mutation }).next();
    expect((published.value as any).data.publishGlobalAnnouncement.id).toBeTruthy();

    await expect(next).resolves.toMatchObject({
      value: { data: { newGlobalAnnouncement: { title: 'Maintenance', severity: 'WARNING', publishedBy: 'admin-1' } } },
    });
    await iterator.return?.();
  });

  it('removes subscription listeners when the client completes the operation', async () => {
    const client = connect(studentToken);
    const iterator = client.iterate({ query: EXERCISE_SUB, variables: { studentId: 'student-1' } });
    void iterator.next();
    await waitFor(() => pubsub.listenerCount(topics.exerciseStatus('student-1')) === 1);

    await iterator.return?.();
    await waitFor(() => pubsub.listenerCount(topics.exerciseStatus('student-1')) === 0);
  });

  it('removes subscription listeners and the socket when the client disconnects', async () => {
    const client = connect(studentToken);
    const iterator = client.iterate({ query: `subscription { newGlobalAnnouncement { id } }` });
    void iterator.next().catch(() => undefined);
    await waitFor(() => pubsub.listenerCount(topics.announcements()) === 1);
    const connectionsBefore = server.stats().connections;

    await client.dispose();
    await waitFor(() => pubsub.listenerCount(topics.announcements()) === 0);
    await waitFor(() => server.stats().connections === connectionsBefore - 1);
  });

  it('closes the socket when the JWT expires', async () => {
    let closeCode: number | undefined;
    const shortLived = sign({ userId: 'student-1', exp: Math.floor(Date.now() / 1000) + 1 }, {});
    const client = connect(shortLived, (event) => {
      closeCode = (event as { code: number }).code;
    });
    const iterator = client.iterate({ query: `subscription { newGlobalAnnouncement { id } }` });
    const next = iterator.next().catch(() => undefined);
    await waitFor(() => pubsub.listenerCount(topics.announcements()) === 1);

    await waitFor(() => closeCode !== undefined, 3_000);
    expect(closeCode).toBe(4401);
    await next;
    await waitFor(() => pubsub.listenerCount(topics.announcements()) === 0);
  });
});
