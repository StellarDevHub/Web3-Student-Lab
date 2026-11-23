import { describe, expect, it, jest } from '@jest/globals';
import {
  RedisStreamBus,
  compareStreamIds,
  parseStreamEntries,
  type StreamEvent,
} from '../src/infrastructure/RedisStreamBus.js';
import { BackpressureController, type QueuedEvent } from '../src/websocket/BackpressureController.js';
import { WebSocketCluster, type ClusterSocket } from '../src/websocket/WebSocketCluster.js';

interface SentMessage {
  event: string;
  payload: unknown;
  eventId: string;
}

class FakeSocket implements ClusterSocket {
  readonly sent: SentMessage[] = [];
  bufferedAmount = 0;
  disconnected = false;
  readonly conn: { bufferedAmount: number; on: () => void };

  constructor(readonly id: string) {
    this.conn = {
      bufferedAmount: this.bufferedAmount,
      on: jest.fn(),
    };
  }

  emit(event: string, ...args: unknown[]): boolean {
    this.sent.push({
      event,
      payload: args[0],
      eventId: args[1] === undefined ? '' : String(args[1]),
    });
    return true;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

const createBus = (): RedisStreamBus => new RedisStreamBus({ redis: null });

const createCluster = (bus: RedisStreamBus): WebSocketCluster =>
  new WebSocketCluster({
    bus,
    nodeId: 'test-node',
    highWaterMark: 10_000,
    maxQueueSize: 100,
    batchSize: 100,
  });

describe('RedisStreamBus (#1417)', () => {
  it('compares stream ids by millisecond then sequence', () => {
    expect(compareStreamIds('100-0', '100-1')).toBeLessThan(0);
    expect(compareStreamIds('101-0', '100-9')).toBeGreaterThan(0);
    expect(compareStreamIds('100-2', '100-2')).toBe(0);
  });

  it('parses ioredis-shaped stream entries', () => {
    const raw = [
      ['1700000000000-0', ['channel', 'dashboard_updated', 'event', 'dashboard_updated', 'data', '{"total":3}']],
    ];
    const events = parseStreamEntries(raw);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      id: '1700000000000-0',
      channel: 'dashboard_updated',
      event: 'dashboard_updated',
      payload: { total: 3 },
    });
  });

  it('returns events strictly after the cursor, in order', async () => {
    const bus = createBus();
    const first = await bus.publish('dashboard_updated', 'dashboard_updated', { n: 1 });
    const second = await bus.publish('dashboard_updated', 'dashboard_updated', { n: 2 });
    const third = await bus.publish('dashboard_updated', 'dashboard_updated', { n: 3 });

    const replayed = await bus.replay(first);
    expect(replayed.map((event: StreamEvent) => event.id)).toEqual([second, third]);
    expect(replayed.map((event: StreamEvent) => (event.payload as { n: number }).n)).toEqual([2, 3]);
  });

  it('replays nothing when no cursor is supplied', async () => {
    const bus = createBus();
    await bus.publish('dashboard_updated', 'dashboard_updated', { n: 1 });
    expect(await bus.replay(null)).toEqual([]);
  });

  it('tracks a consumer-group cursor so each node reads every event once', async () => {
    const bus = createBus();
    await bus.publish('dashboard_updated', 'dashboard_updated', { n: 1 });
    await bus.publish('dashboard_updated', 'dashboard_updated', { n: 2 });

    const firstRead = await bus.readGroup('ws:cluster:node-a', 'node-a', 100);
    expect(firstRead).toHaveLength(2);

    const secondRead = await bus.readGroup('ws:cluster:node-a', 'node-a', 100);
    expect(secondRead).toHaveLength(0);

    const otherNode = await bus.readGroup('ws:cluster:node-b', 'node-b', 100);
    expect(otherNode).toHaveLength(2);
  });
});

describe('WebSocketCluster (#1417)', () => {
  it('fans out broadcast events to every local client', async () => {
    const cluster = createCluster(createBus());
    const alice = new FakeSocket('alice');
    const bob = new FakeSocket('bob');
    cluster.registerSocket(alice, { userId: 'alice' });
    cluster.registerSocket(bob, { userId: 'bob' });

    await cluster.publish('dashboard_updated', 'dashboard_updated', { total: 5 });
    await cluster.pollOnce();

    expect(alice.sent).toHaveLength(1);
    expect(bob.sent).toHaveLength(1);
    expect(alice.sent[0]?.event).toBe('dashboard_updated');
  });

  it('delivers targeted events only to the addressed user', async () => {
    const cluster = createCluster(createBus());
    const alice = new FakeSocket('alice');
    const bob = new FakeSocket('bob');
    cluster.registerSocket(alice, { userId: 'alice' });
    cluster.registerSocket(bob, { userId: 'bob' });

    await cluster.publish('user_metrics_updated', 'user_metrics_updated', {
      userId: 'alice',
      progress: 40,
    });
    await cluster.pollOnce();

    expect(alice.sent).toHaveLength(1);
    expect(bob.sent).toHaveLength(0);
  });

  it('delivers channel events only to subscribers of that channel', async () => {
    const cluster = createCluster(createBus());
    const subscriber = new FakeSocket('subscriber');
    const bystander = new FakeSocket('bystander');
    cluster.registerSocket(subscriber, { userId: 'u1', rooms: ['room:abc'] });
    cluster.registerSocket(bystander, { userId: 'u2' });

    await cluster.publish('room:abc', 'collaboration:update', { text: 'hi' });
    await cluster.pollOnce();

    expect(subscriber.sent).toHaveLength(1);
    expect(bystander.sent).toHaveLength(0);
  });

  it('replays missed events in order when a client reconnects with lastEventId', async () => {
    const cluster = createCluster(createBus());

    const firstSocket = new FakeSocket('s1');
    cluster.registerSocket(firstSocket, { userId: 'alice' });
    const firstId = await cluster.publish('dashboard_updated', 'dashboard_updated', { n: 1 });
    await cluster.pollOnce();
    expect(firstSocket.sent).toHaveLength(1);

    cluster.unregisterSocket('s1');
    await cluster.publish('dashboard_updated', 'dashboard_updated', { n: 2 });
    await cluster.publish('dashboard_updated', 'dashboard_updated', { n: 3 });

    const reconnected = new FakeSocket('s2');
    cluster.registerSocket(reconnected, { userId: 'alice' });
    const replayed = await cluster.resume('s2', firstId);

    expect(replayed).toBe(2);
    expect(reconnected.sent.map((message) => (message.payload as { n: number }).n)).toEqual([2, 3]);
    expect(reconnected.sent.every((message) => message.eventId.length > 0)).toBe(true);
  });

  it('does not replay already-seen events or events for other users', async () => {
    const cluster = createCluster(createBus());

    const seed = new FakeSocket('seed');
    cluster.registerSocket(seed, { userId: 'seed' });
    const seededId = await cluster.publish('dashboard_updated', 'dashboard_updated', { n: 0 });
    await cluster.pollOnce();

    await cluster.publish('user_metrics_updated', 'user_metrics_updated', { userId: 'bob', n: 1 });
    await cluster.publish('user_metrics_updated', 'user_metrics_updated', { userId: 'alice', n: 2 });

    const alice = new FakeSocket('alice-2');
    cluster.registerSocket(alice, { userId: 'alice' });
    const replayed = await cluster.resume('alice-2', seededId);

    expect(replayed).toBe(1);
    expect((alice.sent[0]?.payload as { n: number }).n).toBe(2);
  });

  it('replays nothing without a lastEventId', async () => {
    const cluster = createCluster(createBus());
    const socket = new FakeSocket('no-cursor');
    cluster.registerSocket(socket, { userId: 'alice' });
    await cluster.publish('dashboard_updated', 'dashboard_updated', { n: 1 });

    expect(await cluster.resume('no-cursor', null)).toBe(0);
    expect(socket.sent).toHaveLength(0);
  });

  it('exposes per-client backpressure stats', async () => {
    const cluster = createCluster(createBus());
    const socket = new FakeSocket('slow');
    cluster.registerSocket(socket, { userId: 'alice' });
    await cluster.publish('dashboard_updated', 'dashboard_updated', { n: 1 });
    await cluster.pollOnce();

    const stats = cluster.getStats();
    expect(stats.delivered).toBe(1);
    expect(stats.clients).toBe(1);
    expect(stats.backpressure.slow?.sent).toBe(1);
  });
});

describe('BackpressureController (#1417)', () => {
  it('sends immediately while below the high-water mark', () => {
    const sent: QueuedEvent[] = [];
    let buffered = 0;
    const controller = new BackpressureController({
      highWaterMark: 100,
      maxQueueSize: 10,
      bufferedAmount: () => buffered,
      send: (item) => sent.push(item),
    });

    expect(controller.enqueue({ event: 'a', payload: {}, eventId: '1-0' })).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(controller.pending).toBe(0);

    buffered = 0;
    expect(controller.getStats().dropped).toBe(0);
  });

  it('queues and drains in order once the socket catches up', () => {
    const sent: QueuedEvent[] = [];
    let buffered = 999;
    const controller = new BackpressureController({
      highWaterMark: 100,
      maxQueueSize: 10,
      bufferedAmount: () => buffered,
      send: (item) => sent.push(item),
    });

    controller.enqueue({ event: 'a', payload: {}, eventId: '1-0' });
    controller.enqueue({ event: 'b', payload: {}, eventId: '2-0' });
    expect(sent).toHaveLength(0);
    expect(controller.pending).toBe(2);

    buffered = 0;
    expect(controller.drain()).toBe(2);
    expect(sent.map((item) => item.event)).toEqual(['a', 'b']);
    expect(controller.pending).toBe(0);
  });

  it('drops the oldest queued event when the buffer overflows', () => {
    const sent: QueuedEvent[] = [];
    const dropped: QueuedEvent[] = [];
    let buffered = 999;
    const controller = new BackpressureController({
      highWaterMark: 100,
      maxQueueSize: 3,
      bufferedAmount: () => buffered,
      send: (item) => sent.push(item),
      onDrop: (item) => dropped.push(item),
    });

    for (let i = 1; i <= 5; i += 1) {
      controller.enqueue({ event: `e${i}`, payload: {}, eventId: `${i}-0` });
    }

    expect(controller.pending).toBe(3);
    expect(controller.getStats().dropped).toBe(2);
    expect(dropped.map((item) => item.event)).toEqual(['e1', 'e2']);

    buffered = 0;
    controller.drain();
    expect(sent.map((item) => item.event)).toEqual(['e3', 'e4', 'e5']);
  });
});
