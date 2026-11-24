import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import logger from '../utils/logger.js';

/**
 * Redis transport for the Yjs collaboration server (#1592 / BE-020).
 *
 * - Every binary document update is appended to a per-room Redis stream so a
 *   pod that (re)loads a room can replay what happened since the last
 *   PostgreSQL snapshot.
 * - Updates and awareness changes are fanned out to the other pods over
 *   Redis Pub/Sub, so clients connected to different instances stay in sync.
 */

const STREAM_MAXLEN = parseInt(process.env.YJS_STREAM_MAXLEN || '5000', 10);
const STREAM_TTL_MS = parseInt(process.env.YJS_STREAM_TTL_MS || String(7 * 24 * 60 * 60 * 1000), 10);
const KEY_PREFIX = process.env.YJS_REDIS_PREFIX || 'yjs';

export enum FrameKind {
  Update = 0,
  Awareness = 1,
}

export interface RemoteFrame {
  kind: FrameKind;
  payload: Uint8Array;
  /** Stream id of a persisted update (empty for awareness frames). */
  streamId: string;
}

export type RemoteFrameHandler = (frame: RemoteFrame) => void;

export interface StreamEntry {
  id: string;
  update: Uint8Array;
}

/** Compare two Redis stream ids (`<ms>-<seq>`). */
export function compareStreamIds(a: string, b: string): number {
  const [am = 0, as = 0] = a.split('-').map(Number);
  const [bm = 0, bs = 0] = b.split('-').map(Number);
  return am !== bm ? am - bm : as - bs;
}

/** Stream id `windowMs` before `id`, used for overlapping replay and trimming. */
export function streamIdBefore(id: string, windowMs: number): string {
  const ms = Number(id.split('-')[0]);
  return `${Math.max(0, ms - windowMs)}-0`;
}

export class YjsRedisStore {
  /** Identifies this pod so it can ignore its own Pub/Sub echoes. */
  readonly instanceId = randomUUID();
  private readonly handlers = new Map<string, RemoteFrameHandler>();

  constructor(
    private readonly client: Redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    }),
    private readonly subscriber: Redis = client.duplicate()
  ) {
    this.client.on('error', (err) => logger.warn(`Yjs Redis error: ${err.message}`));
    this.subscriber.on('error', (err) => logger.warn(`Yjs Redis subscriber error: ${err.message}`));
    this.subscriber.on('messageBuffer', (channel: Buffer, message: Buffer) => {
      this.dispatch(channel.toString(), message);
    });
  }

  private streamKey(room: string): string {
    return `${KEY_PREFIX}:stream:${room}`;
  }

  private channel(room: string): string {
    return `${KEY_PREFIX}:room:${room}`;
  }

  private encodeFrame(kind: FrameKind, payload: Uint8Array, streamId: string): Buffer {
    const encoder = encoding.createEncoder();
    encoding.writeVarString(encoder, this.instanceId);
    encoding.writeVarUint(encoder, kind);
    encoding.writeVarString(encoder, streamId);
    encoding.writeVarUint8Array(encoder, payload);
    return Buffer.from(encoding.toUint8Array(encoder));
  }

  private dispatch(channel: string, message: Buffer): void {
    const room = channel.slice(`${KEY_PREFIX}:room:`.length);
    const handler = this.handlers.get(room);
    if (!handler) return;
    try {
      const decoder = decoding.createDecoder(new Uint8Array(message));
      if (decoding.readVarString(decoder) === this.instanceId) return;
      const kind = decoding.readVarUint(decoder) as FrameKind;
      const streamId = decoding.readVarString(decoder);
      const payload = decoding.readVarUint8Array(decoder);
      handler({ kind, payload, streamId });
    } catch (err) {
      logger.warn(`Dropping malformed Yjs frame on ${channel}: ${(err as Error).message}`);
    }
  }

  /** Persist an update to the room stream and broadcast it to other pods. */
  async appendUpdate(room: string, update: Uint8Array): Promise<string> {
    const key = this.streamKey(room);
    const id = (await this.client.xadd(
      key,
      'MAXLEN',
      '~',
      String(STREAM_MAXLEN),
      '*',
      'u',
      Buffer.from(update)
    )) as string;
    await this.client
      .pipeline()
      .pexpire(key, STREAM_TTL_MS)
      .publish(this.channel(room), this.encodeFrame(FrameKind.Update, update, id))
      .exec();
    return id;
  }

  /** Awareness is ephemeral: broadcast only, never persisted. */
  async publishAwareness(room: string, update: Uint8Array): Promise<void> {
    await this.client.publish(this.channel(room), this.encodeFrame(FrameKind.Awareness, update, ''));
  }

  /** Updates appended after `afterId` (inclusive of everything when omitted). */
  async readUpdatesSince(room: string, afterId?: string | null): Promise<StreamEntry[]> {
    const start = afterId ? `(${afterId}` : '-';
    const rows = (await this.client.xrangeBuffer(this.streamKey(room), start, '+')) as [Buffer, Buffer[]][];
    const entries: StreamEntry[] = [];
    for (const [id, fields] of rows) {
      for (let i = 0; i + 1 < fields.length; i += 2) {
        const value = fields[i + 1];
        if (fields[i]?.toString() === 'u' && value) {
          entries.push({ id: id.toString(), update: new Uint8Array(value) });
        }
      }
    }
    return entries;
  }

  /** Drop stream entries older than `minId`; they are covered by a snapshot. */
  async trimBefore(room: string, minId: string): Promise<void> {
    await this.client.xtrim(this.streamKey(room), 'MINID', '~', minId);
  }

  async subscribe(room: string, handler: RemoteFrameHandler): Promise<void> {
    this.handlers.set(room, handler);
    await this.subscriber.subscribe(this.channel(room));
  }

  async unsubscribe(room: string): Promise<void> {
    this.handlers.delete(room);
    await this.subscriber.unsubscribe(this.channel(room));
  }

  async close(): Promise<void> {
    this.handlers.clear();
    await Promise.allSettled([this.subscriber.quit(), this.client.quit()]);
  }
}
