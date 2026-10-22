import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { RawData, WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import {
  FrameKind,
  RemoteFrame,
  YjsRedisStore,
  compareStreamIds,
  streamIdBefore,
} from '../cache/yjsRedisStore.js';
import logger from '../utils/logger.js';

/**
 * Owns the in-memory Yjs documents served by the collaboration server
 * (#1592 / BE-020).
 *
 * - Speaks the binary y-protocols sync + awareness messages directly.
 * - Rooms are loaded from the latest PostgreSQL snapshot plus the Redis
 *   stream tail, and kept in sync across pods through Redis Pub/Sub.
 * - Dirty documents are snapshotted incrementally every 60s; a room is
 *   flushed and freed as soon as its last local client disconnects, so idle
 *   rooms never accumulate in memory.
 */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const SNAPSHOT_INTERVAL_MS = parseInt(process.env.YJS_SNAPSHOT_INTERVAL_MS || '60000', 10);
// Replay/trim overlap: cross-pod updates can arrive slightly out of stream
// order, and Yjs updates are idempotent, so replaying a little extra is safe.
const STREAM_REPLAY_WINDOW_MS = parseInt(process.env.YJS_STREAM_REPLAY_WINDOW_MS || '60000', 10);
// Close slow consumers instead of buffering unbounded data for them.
const MAX_BUFFERED_BYTES = parseInt(process.env.YJS_MAX_BUFFERED_BYTES || String(4 * 1024 * 1024), 10);

const REMOTE_ORIGIN = Symbol('yjs-remote');
const PERSISTENCE_ORIGIN = Symbol('yjs-persistence');

export interface SnapshotRow {
  state: Uint8Array;
  stateVector: Uint8Array;
  lastStreamId: string | null;
}

export interface SnapshotPersistence {
  load(name: string): Promise<SnapshotRow | null>;
  save(name: string, row: SnapshotRow): Promise<void>;
}

/** PostgreSQL snapshots via Prisma (`yjs_document_snapshots`). */
export function createPrismaSnapshotPersistence(): SnapshotPersistence {
  // Loaded lazily so the collaboration server only connects when it needs to.
  const client = import('../db/index.js').then((m) => m.default as any);
  return {
    async load(name) {
      const row = await (await client).yjsDocumentSnapshot.findUnique({ where: { name } });
      return row
        ? { state: new Uint8Array(row.state), stateVector: new Uint8Array(row.stateVector), lastStreamId: row.lastStreamId }
        : null;
    },
    async save(name, row) {
      const data = {
        state: Buffer.from(row.state),
        stateVector: Buffer.from(row.stateVector),
        lastStreamId: row.lastStreamId,
      };
      await (await client).yjsDocumentSnapshot.upsert({
        where: { name },
        create: { name, ...data },
        update: data,
      });
    },
  };
}

function toUint8Array(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  return new Uint8Array(data);
}

function isEmptyUpdate(update: Uint8Array): boolean {
  // An update with no structs and an empty delete set encodes to [0, 0].
  return update.length <= 2 && update.every((b) => b === 0);
}

export class SharedDoc extends Y.Doc {
  readonly awareness: awarenessProtocol.Awareness;
  /** Local connections and the awareness client ids each one controls. */
  readonly conns = new Map<WebSocket, Set<number>>();
  /** Highest Redis stream id known to be included in this document. */
  latestStreamId: string | null = null;
  dirty = false;

  constructor(
    readonly name: string,
    private readonly manager: YjsDocumentManager
  ) {
    super({ gc: true });
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.on('update', (update: Uint8Array, origin: unknown) => this.handleUpdate(update, origin));
    this.awareness.on('update', (changes: AwarenessChanges, origin: unknown) =>
      this.handleAwareness(changes, origin)
    );
  }

  noteStreamId(id: string): void {
    if (id && (!this.latestStreamId || compareStreamIds(id, this.latestStreamId) > 0)) {
      this.latestStreamId = id;
    }
  }

  private handleUpdate(update: Uint8Array, origin: unknown): void {
    if (origin !== PERSISTENCE_ORIGIN) this.dirty = true;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.manager.broadcast(this, encoding.toUint8Array(encoder));

    if (origin !== REMOTE_ORIGIN && origin !== PERSISTENCE_ORIGIN) {
      this.manager.store
        .appendUpdate(this.name, update)
        .then((id) => this.noteStreamId(id))
        .catch((err) => logger.error(`Failed to persist Yjs update for ${this.name}: ${err.message}`));
    }
  }

  private handleAwareness({ added, updated, removed }: AwarenessChanges, origin: unknown): void {
    const changed = added.concat(updated, removed);
    if (origin instanceof WebSocket) {
      const controlled = this.conns.get(origin);
      if (controlled) {
        added.forEach((id) => controlled.add(id));
        removed.forEach((id) => controlled.delete(id));
      }
    }

    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, update);
    this.manager.broadcast(this, encoding.toUint8Array(encoder));

    if (origin !== REMOTE_ORIGIN) {
      this.manager.store
        .publishAwareness(this.name, update)
        .catch((err) => logger.warn(`Failed to publish awareness for ${this.name}: ${err.message}`));
    }
  }

  applyRemote(frame: RemoteFrame): void {
    if (frame.kind === FrameKind.Update) {
      Y.applyUpdate(this, frame.payload, REMOTE_ORIGIN);
      this.noteStreamId(frame.streamId);
    } else {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, frame.payload, REMOTE_ORIGIN);
    }
  }
}

interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

export class YjsDocumentManager {
  private readonly docs = new Map<string, Promise<SharedDoc>>();
  private snapshotTimer?: NodeJS.Timeout;
  private connectionCount = 0;

  constructor(
    readonly store: YjsRedisStore = new YjsRedisStore(),
    private readonly persistence: SnapshotPersistence = createPrismaSnapshotPersistence()
  ) {}

  stats(): { rooms: number; connections: number } {
    return { rooms: this.docs.size, connections: this.connectionCount };
  }

  /** Load (or reuse) a room: snapshot → stream tail → live Pub/Sub. */
  getDoc(name: string): Promise<SharedDoc> {
    let pending = this.docs.get(name);
    if (!pending) {
      pending = this.loadDoc(name).catch((err) => {
        this.docs.delete(name);
        throw err;
      });
      this.docs.set(name, pending);
    }
    return pending;
  }

  private async loadDoc(name: string): Promise<SharedDoc> {
    const doc = new SharedDoc(name, this);

    // Subscribe first so nothing published while we replay is missed.
    await this.store.subscribe(name, (frame) => doc.applyRemote(frame));

    const snapshot = await this.persistence.load(name);
    if (snapshot) {
      Y.applyUpdate(doc, snapshot.state, PERSISTENCE_ORIGIN);
      if (snapshot.lastStreamId) doc.noteStreamId(snapshot.lastStreamId);
    }

    const replayFrom = snapshot?.lastStreamId ? streamIdBefore(snapshot.lastStreamId, STREAM_REPLAY_WINDOW_MS) : null;
    const tail = await this.store.readUpdatesSince(name, replayFrom);
    if (tail.length > 0) {
      Y.transact(doc, () => {
        for (const entry of tail) Y.applyUpdate(doc, entry.update, REMOTE_ORIGIN);
      }, REMOTE_ORIGIN);
      for (const entry of tail) doc.noteStreamId(entry.id);
      // Fold the replayed tail into the next snapshot.
      doc.dirty = true;
    }

    logger.info(`Loaded Yjs room ${name} (snapshot=${Boolean(snapshot)}, replayed=${tail.length})`);
    return doc;
  }

  broadcast(doc: SharedDoc, message: Uint8Array): void {
    for (const conn of doc.conns.keys()) this.send(doc, conn, message);
  }

  private send(doc: SharedDoc, conn: WebSocket, message: Uint8Array): void {
    if (conn.readyState !== WebSocket.OPEN || conn.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.closeConn(doc, conn);
      return;
    }
    conn.send(message, (err) => {
      if (err) this.closeConn(doc, conn);
    });
  }

  /** Attach a WebSocket to a room and run the y-protocols handshake. */
  async setupConnection(conn: WebSocket, name: string): Promise<void> {
    conn.binaryType = 'arraybuffer';

    // Buffer messages that arrive while the room is still loading.
    const queued: Uint8Array[] = [];
    const queue = (data: RawData) => {
      queued.push(toUint8Array(data));
    };
    conn.on('message', queue);

    let doc: SharedDoc;
    try {
      doc = await this.getDoc(name);
    } catch (err) {
      logger.error(`Failed to load Yjs room ${name}: ${(err as Error).message}`);
      conn.close(1011, 'room unavailable');
      return;
    }
    if (conn.readyState !== WebSocket.OPEN) {
      await this.releaseIfIdle(doc);
      return;
    }

    doc.conns.set(conn, new Set());
    this.connectionCount++;
    conn.off('message', queue);
    conn.on('message', (data: RawData) => this.handleMessage(doc, conn, toUint8Array(data)));
    conn.on('close', () => this.closeConn(doc, conn));
    conn.on('error', (err) => {
      logger.warn(`WebSocket error in room ${name}: ${err.message}`);
      this.closeConn(doc, conn);
    });

    // Sync step 1 + current awareness so the client can catch up.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    this.send(doc, conn, encoding.toUint8Array(encoder));

    const states = doc.awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(states.keys()))
      );
      this.send(doc, conn, encoding.toUint8Array(awarenessEncoder));
    }

    for (const message of queued) this.handleMessage(doc, conn, message);
  }

  private handleMessage(doc: SharedDoc, conn: WebSocket, message: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(message);
      const encoder = encoding.createEncoder();
      switch (decoding.readVarUint(decoder)) {
        case MESSAGE_SYNC:
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
          // Only reply when the sync step produced content (e.g. step 2).
          if (encoding.length(encoder) > 1) this.send(doc, conn, encoding.toUint8Array(encoder));
          break;
        case MESSAGE_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
          break;
        default:
          break;
      }
    } catch (err) {
      logger.warn(`Dropping malformed Yjs message in room ${doc.name}: ${(err as Error).message}`);
    }
  }

  private closeConn(doc: SharedDoc, conn: WebSocket): void {
    const controlled = doc.conns.get(conn);
    if (controlled) {
      doc.conns.delete(conn);
      this.connectionCount--;
      awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlled), null);
    }
    if (conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING) {
      conn.close();
    }
    if (controlled) void this.releaseIfIdle(doc);
  }

  /** Flush and free a room once no local client is connected to it. */
  private async releaseIfIdle(doc: SharedDoc): Promise<void> {
    if (doc.conns.size > 0 || this.docs.get(doc.name) === undefined) return;
    this.docs.delete(doc.name);
    try {
      await this.snapshot(doc);
    } catch (err) {
      logger.error(`Final Yjs snapshot for ${doc.name} failed: ${(err as Error).message}`);
    }
    await this.store.unsubscribe(doc.name).catch(() => undefined);
    doc.awareness.destroy();
    doc.destroy();
  }

  /**
   * Incremental snapshot: only the part of the document not yet covered by
   * the stored state vector is merged into the stored state, so concurrent
   * snapshots from several pods converge instead of overwriting each other.
   */
  async snapshot(doc: SharedDoc): Promise<boolean> {
    if (!doc.dirty) return false;
    doc.dirty = false;
    const streamId = doc.latestStreamId;

    try {
      const existing = await this.persistence.load(doc.name);
      let state: Uint8Array;
      if (existing) {
        const diff = Y.encodeStateAsUpdate(doc, existing.stateVector);
        if (isEmptyUpdate(diff) && streamId === existing.lastStreamId) return false;
        state = Y.mergeUpdates([existing.state, diff]);
      } else {
        state = Y.encodeStateAsUpdate(doc);
      }

      await this.persistence.save(doc.name, {
        state,
        stateVector: Y.encodeStateVectorFromUpdate(state),
        lastStreamId: streamId,
      });
      if (streamId) {
        await this.store.trimBefore(doc.name, streamIdBefore(streamId, STREAM_REPLAY_WINDOW_MS));
      }
      return true;
    } catch (err) {
      doc.dirty = true;
      throw err;
    }
  }

  async snapshotAll(): Promise<number> {
    let saved = 0;
    for (const pending of this.docs.values()) {
      try {
        if (await this.snapshot(await pending)) saved++;
      } catch (err) {
        logger.error(`Yjs snapshot failed: ${(err as Error).message}`);
      }
    }
    return saved;
  }

  startSnapshotting(intervalMs = SNAPSHOT_INTERVAL_MS): void {
    if (this.snapshotTimer) return;
    this.snapshotTimer = setInterval(() => {
      void this.snapshotAll().then((saved) => {
        if (saved > 0) logger.info(`Snapshotted ${saved} Yjs document(s)`);
      });
    }, intervalMs);
    this.snapshotTimer.unref?.();
  }

  async shutdown(): Promise<void> {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.snapshotTimer = undefined;
    await this.snapshotAll();
    await this.store.close();
  }
}
