import logger from '../utils/logger.js';
import redisClient from '../cache/RedisClient.js';

export interface StreamEvent {
  id: string;
  channel: string;
  event: string;
  payload: unknown;
}

export interface StreamRedisLike {
  xadd(...args: unknown[]): Promise<unknown>;
  xgroup(...args: unknown[]): Promise<unknown>;
  xreadgroup(...args: unknown[]): Promise<unknown>;
  xack(...args: unknown[]): Promise<unknown>;
  xrange(...args: unknown[]): Promise<unknown>;
}

export interface RedisStreamBusOptions {
  streamKey?: string;
  maxLen?: number;
  redis?: StreamRedisLike | null;
  redisFactory?: () => StreamRedisLike | null;
}

export const DEFAULT_STREAM_KEY = 'ws:events';
export const DEFAULT_STREAM_MAX_LEN = 10_000;

export function compareStreamIds(a: string, b: string): number {
  const [aMs, aSeq] = a.split('-');
  const [bMs, bSeq] = b.split('-');
  const aMillis = Number(aMs);
  const bMillis = Number(bMs);
  if (aMillis !== bMillis) {
    return aMillis < bMillis ? -1 : 1;
  }
  const aCounter = Number(aSeq ?? 0);
  const bCounter = Number(bSeq ?? 0);
  if (aCounter === bCounter) {
    return 0;
  }
  return aCounter < bCounter ? -1 : 1;
}

export function isLaterStreamId(id: string, than: string): boolean {
  return compareStreamIds(id, than) > 0;
}

function fieldsToMap(fields: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(fields)) {
    return map;
  }
  for (let i = 0; i + 1 < fields.length; i += 2) {
    map[String(fields[i])] = String(fields[i + 1]);
  }
  return map;
}

function entryToEvent(entry: unknown): StreamEvent | null {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }
  const id = String(entry[0]);
  const map = fieldsToMap(entry[1]);
  if (!map.channel || !map.event) {
    return null;
  }
  let payload: unknown = map.data ?? null;
  if (typeof map.data === 'string') {
    try {
      payload = JSON.parse(map.data);
    } catch {
      payload = map.data;
    }
  }
  return { id, channel: map.channel, event: map.event, payload };
}

export function parseStreamEntries(raw: unknown): StreamEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const events: StreamEvent[] = [];
  for (const entry of raw) {
    const parsed = entryToEvent(entry);
    if (parsed) {
      events.push(parsed);
    }
  }
  return events;
}

export function parseReadGroupResult(raw: unknown): StreamEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const events: StreamEvent[] = [];
  for (const stream of raw) {
    if (!Array.isArray(stream) || stream.length < 2) {
      continue;
    }
    events.push(...parseStreamEntries(stream[1]));
  }
  return events;
}

export class InMemoryStreamStore {
  private events: StreamEvent[] = [];
  private counter = 0;
  private cursors = new Map<string, string>();

  constructor(private readonly maxLen = DEFAULT_STREAM_MAX_LEN) {}

  append(channel: string, event: string, payload: unknown): string {
    const id = `${Date.now()}-${this.counter++}`;
    this.events.push({ id, channel, event, payload });
    while (this.events.length > this.maxLen) {
      this.events.shift();
    }
    return id;
  }

  range(fromExclusive: string, count?: number): StreamEvent[] {
    const matched = this.events.filter((entry) => isLaterStreamId(entry.id, fromExclusive));
    return typeof count === 'number' ? matched.slice(0, count) : matched;
  }

  ensureGroup(group: string): void {
    if (!this.cursors.has(group)) {
      this.cursors.set(group, '0-0');
    }
  }

  readGroup(group: string, count?: number): StreamEvent[] {
    this.ensureGroup(group);
    const cursor = this.cursors.get(group) ?? '0-0';
    const pending = this.events.filter((entry) => isLaterStreamId(entry.id, cursor));
    const batch = typeof count === 'number' ? pending.slice(0, count) : pending;
    if (batch.length > 0) {
      this.cursors.set(group, batch[batch.length - 1]!.id);
    }
    return batch;
  }

  size(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
    this.cursors.clear();
    this.counter = 0;
  }
}

export class RedisStreamBus {
  readonly streamKey: string;
  readonly maxLen: number;
  private readonly memory: InMemoryStreamStore;
  private readonly explicitRedis: StreamRedisLike | null | undefined;
  private readonly redisFactory: () => StreamRedisLike | null;

  constructor(options: RedisStreamBusOptions = {}) {
    this.streamKey = options.streamKey ?? DEFAULT_STREAM_KEY;
    this.maxLen = options.maxLen ?? DEFAULT_STREAM_MAX_LEN;
    this.memory = new InMemoryStreamStore(this.maxLen);
    this.explicitRedis = options.redis;
    this.redisFactory =
      options.redisFactory ??
      (() => (redisClient.getClient() as unknown as StreamRedisLike | null) ?? null);
  }

  get memoryStore(): InMemoryStreamStore {
    return this.memory;
  }

  isDurable(): boolean {
    return this.resolveRedis() !== null;
  }

  private resolveRedis(): StreamRedisLike | null {
    if (this.explicitRedis !== undefined) {
      return this.explicitRedis;
    }
    try {
      return this.redisFactory();
    } catch (error) {
      logger.warn('RedisStreamBus: redis resolution failed, using in-memory fallback', error);
      return null;
    }
  }

  async publish(channel: string, event: string, payload: unknown): Promise<string> {
    const redis = this.resolveRedis();
    if (!redis) {
      return this.memory.append(channel, event, payload);
    }
    try {
      const id = await redis.xadd(
        this.streamKey,
        'MAXLEN',
        '~',
        String(this.maxLen),
        '*',
        'channel',
        channel,
        'event',
        event,
        'data',
        JSON.stringify(payload ?? null)
      );
      return String(id);
    } catch (error) {
      logger.error('RedisStreamBus: XADD failed, falling back to memory store', error);
      return this.memory.append(channel, event, payload);
    }
  }

  async replay(fromExclusive: string | null | undefined, count?: number): Promise<StreamEvent[]> {
    if (!fromExclusive) {
      return [];
    }
    const redis = this.resolveRedis();
    if (!redis) {
      return this.memory.range(fromExclusive, count);
    }
    try {
      const raw = count
        ? await redis.xrange(this.streamKey, `(${fromExclusive}`, '+', 'COUNT', count)
        : await redis.xrange(this.streamKey, `(${fromExclusive}`, '+');
      return parseStreamEntries(raw);
    } catch (error) {
      logger.error('RedisStreamBus: XRANGE failed, falling back to memory store', error);
      return this.memory.range(fromExclusive, count);
    }
  }

  async ensureGroup(group: string): Promise<void> {
    const redis = this.resolveRedis();
    if (!redis) {
      this.memory.ensureGroup(group);
      return;
    }
    try {
      await redis.xgroup('CREATE', this.streamKey, group, '0', 'MKSTREAM');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('BUSYGROUP')) {
        logger.warn(`RedisStreamBus: XGROUP CREATE failed for ${group}`, error);
        this.memory.ensureGroup(group);
      }
    }
  }

  async readGroup(group: string, consumer: string, count: number): Promise<StreamEvent[]> {
    const redis = this.resolveRedis();
    if (!redis) {
      return this.memory.readGroup(group, count);
    }
    try {
      const raw = await redis.xreadgroup(
        'GROUP',
        group,
        consumer,
        'COUNT',
        count,
        'STREAMS',
        this.streamKey,
        '>'
      );
      return parseReadGroupResult(raw);
    } catch (error) {
      logger.error('RedisStreamBus: XREADGROUP failed', error);
      return [];
    }
  }

  async ack(group: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const redis = this.resolveRedis();
    if (!redis) {
      return;
    }
    try {
      await redis.xack(this.streamKey, group, ...ids);
    } catch (error) {
      logger.warn('RedisStreamBus: XACK failed', error);
    }
  }

  clearMemory(): void {
    this.memory.clear();
  }
}
