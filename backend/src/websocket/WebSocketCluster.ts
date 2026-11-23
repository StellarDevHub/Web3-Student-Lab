import logger from '../utils/logger.js';
import {
  RedisStreamBus,
  type RedisStreamBusOptions,
  type StreamEvent,
} from '../infrastructure/RedisStreamBus.js';
import {
  BackpressureController,
  type BackpressureStats,
  type QueuedEvent,
} from './BackpressureController.js';

export interface ClusterSocket {
  id: string;
  emit(event: string, ...args: unknown[]): unknown;
  disconnect(close?: boolean): void;
}

export interface ClusterSocketContext {
  userId: string;
  rooms?: Iterable<string>;
  bufferedAmount?: () => number;
}

export interface WebSocketClusterOptions {
  bus?: RedisStreamBus;
  busOptions?: RedisStreamBusOptions;
  nodeId?: string;
  groupPrefix?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  highWaterMark?: number;
  maxQueueSize?: number;
  broadcastChannels?: Iterable<string>;
}

export interface WebSocketClusterStats {
  nodeId: string;
  group: string;
  durable: boolean;
  clients: number;
  delivered: number;
  replayed: number;
  backpressure: Record<string, BackpressureStats>;
}

interface ClientRecord {
  socket: ClusterSocket;
  userId: string;
  rooms: Set<string>;
  backpressure: BackpressureController;
  cursor: string | null;
}

export const DEFAULT_BROADCAST_CHANNELS = ['dashboard_updated', 'course_notifications'];
export const DEFAULT_HIGH_WATER_MARK = 1 << 20;
export const DEFAULT_MAX_QUEUE_SIZE = 256;
export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_POLL_INTERVAL_MS = 100;

let nodeCounter = 0;

function defaultBufferedAmount(socket: ClusterSocket): number {
  const conn = (socket as unknown as { conn?: { bufferedAmount?: number } }).conn;
  const amount = conn?.bufferedAmount;
  return typeof amount === 'number' ? amount : 0;
}

export class WebSocketCluster {
  private readonly bus: RedisStreamBus;
  private readonly nodeId: string;
  private readonly group: string;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly highWaterMark: number;
  private readonly maxQueueSize: number;
  private readonly broadcastChannels: Set<string>;
  private readonly clients = new Map<string, ClientRecord>();
  private timer: NodeJS.Timeout | null = null;
  private groupReady = false;
  private deliveredCount = 0;
  private replayedCount = 0;

  constructor(options: WebSocketClusterOptions = {}) {
    this.bus = options.bus ?? new RedisStreamBus(options.busOptions);
    this.nodeId = options.nodeId ?? `node-${process.pid}-${nodeCounter++}`;
    const prefix = options.groupPrefix ?? 'ws:cluster';
    this.group = `${prefix}:${this.nodeId}`;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.highWaterMark = options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.broadcastChannels = new Set(options.broadcastChannels ?? DEFAULT_BROADCAST_CHANNELS);
  }

  get id(): string {
    return this.nodeId;
  }

  get consumerGroup(): string {
    return this.group;
  }

  get size(): number {
    return this.clients.size;
  }

  registerSocket(socket: ClusterSocket, context: ClusterSocketContext): void {
    const rooms = new Set<string>(context.rooms ?? []);
    const backpressure = new BackpressureController({
      highWaterMark: this.highWaterMark,
      maxQueueSize: this.maxQueueSize,
      bufferedAmount: context.bufferedAmount ?? (() => defaultBufferedAmount(socket)),
      send: (item: QueuedEvent) => {
        socket.emit(item.event, item.payload, item.eventId);
      },
      onDrop: (item, stats) => {
        logger.warn(
          `WebSocketCluster: dropped event ${item.eventId} for socket ${socket.id} under backpressure`,
          { pending: stats.pending, dropped: stats.dropped }
        );
      },
    });

    this.clients.set(socket.id, {
      socket,
      userId: context.userId,
      rooms,
      backpressure,
      cursor: null,
    });

    const conn = (socket as unknown as { conn?: { on?: Function } }).conn;
    if (conn && typeof conn.on === 'function') {
      conn.on('drain', () => {
        this.clients.get(socket.id)?.backpressure.drain();
      });
    }
  }

  unregisterSocket(socketId: string): void {
    const record = this.clients.get(socketId);
    if (record) {
      record.backpressure.clear();
    }
    this.clients.delete(socketId);
  }

  addRoom(socketId: string, room: string): void {
    this.clients.get(socketId)?.rooms.add(room);
  }

  removeRoom(socketId: string, room: string): void {
    this.clients.get(socketId)?.rooms.delete(room);
  }

  hasSocket(socketId: string): boolean {
    return this.clients.has(socketId);
  }

  async publish(channel: string, event: string, payload: unknown): Promise<string> {
    return this.bus.publish(channel, event, payload);
  }

  private resolveTarget(event: StreamEvent): { userId?: string; room?: string } {
    const payload = event.payload as Record<string, unknown> | null | undefined;
    if (!payload || typeof payload !== 'object') {
      return {};
    }
    const userId = payload.userId ?? payload.targetUserId;
    const room = payload.room;
    return {
      userId: userId === undefined || userId === null ? undefined : String(userId),
      room: typeof room === 'string' ? room : undefined,
    };
  }

  private matches(event: StreamEvent, client: ClientRecord): boolean {
    const { userId, room } = this.resolveTarget(event);
    if (userId) {
      return client.userId === userId;
    }
    if (room) {
      return client.rooms.has(room);
    }
    if (event.channel.startsWith('user:')) {
      return client.rooms.has(event.channel);
    }
    if (this.broadcastChannels.has(event.channel)) {
      return true;
    }
    return client.rooms.has(event.channel) || client.rooms.has(`channel:${event.channel}`);
  }

  private deliverToClient(record: ClientRecord, event: StreamEvent): boolean {
    if (!this.matches(event, record)) {
      return false;
    }
    record.backpressure.enqueue({
      event: event.event,
      payload: event.payload,
      eventId: event.id,
    });
    record.cursor = event.id;
    this.deliveredCount += 1;
    return true;
  }

  private deliverEvent(event: StreamEvent): number {
    let count = 0;
    for (const record of this.clients.values()) {
      if (this.deliverToClient(record, event)) {
        count += 1;
      }
    }
    return count;
  }

  async resume(socketId: string, lastEventId: string | null | undefined): Promise<number> {
    const record = this.clients.get(socketId);
    if (!record || !lastEventId) {
      return 0;
    }
    const events = await this.bus.replay(lastEventId, this.batchSize);
    let count = 0;
    for (const event of events) {
      if (this.deliverToClient(record, event)) {
        count += 1;
        this.replayedCount += 1;
      }
    }
    return count;
  }

  async pollOnce(): Promise<number> {
    if (!this.groupReady) {
      await this.bus.ensureGroup(this.group);
      this.groupReady = true;
    }
    const events = await this.bus.readGroup(this.group, this.nodeId, this.batchSize);
    if (events.length === 0) {
      return 0;
    }
    let count = 0;
    const ackIds: string[] = [];
    for (const event of events) {
      count += this.deliverEvent(event);
      ackIds.push(event.id);
    }
    await this.bus.ack(this.group, ackIds);
    return count;
  }

  async start(): Promise<void> {
    if (this.timer) {
      return;
    }
    await this.bus.ensureGroup(this.group);
    this.groupReady = true;
    this.timer = setInterval(() => {
      void this.pollOnce().catch((error) => {
        logger.error('WebSocketCluster: poll loop error', error);
      });
    }, this.pollIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStats(): WebSocketClusterStats {
    const backpressure: Record<string, BackpressureStats> = {};
    for (const [id, record] of this.clients.entries()) {
      backpressure[id] = record.backpressure.getStats();
    }
    return {
      nodeId: this.nodeId,
      group: this.group,
      durable: this.bus.isDurable(),
      clients: this.clients.size,
      delivered: this.deliveredCount,
      replayed: this.replayedCount,
      backpressure,
    };
  }
}

let singleton: WebSocketCluster | null = null;

export function getWebSocketCluster(options?: WebSocketClusterOptions): WebSocketCluster {
  if (!singleton) {
    singleton = new WebSocketCluster(options);
  }
  return singleton;
}

export function resetWebSocketClusterForTests(): void {
  if (singleton) {
    singleton.stop();
  }
  singleton = null;
}
