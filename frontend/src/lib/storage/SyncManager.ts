'use client';

/**
 * SyncManager — FE-070: Offline-first storage engine with vector-clock
 * conflict tracking and automated two-way sync.
 *
 * Design decisions:
 * - Vector clocks (one entry per device/tab) give us a partial ordering of
 *   mutations richer than a single Lamport counter. The Lamport tick is
 *   also maintained so callers that only need total-order comparison can use
 *   it without understanding the full vector.
 * - Every code-editor mutation is stored in the `code_mutations` IDB object
 *   store with its vector clock snapshot. On reconnect, `twoWaySync` fetches
 *   the server's view, compares clocks, and surfaces genuine conflicts rather
 *   than silently overwriting either side.
 * - Conflict resolution is intentionally left to the caller (via the
 *   `onConflict` callback) so the UI can show an interactive diff modal.
 */

import { DatabaseManager } from '@/lib/storage/DatabaseManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lamport clock value: an integer ≥ 0, monotonically increasing. */
export type LamportTimestamp = number;

/**
 * Vector clock: maps each device/tab identifier to its last known Lamport
 * tick.  A missing entry is equivalent to 0.
 */
export type VectorClock = Record<string, LamportTimestamp>;

export type SyncState = 'idle' | 'syncing' | 'offline' | 'conflict' | 'error';

/** A single code-editor mutation persisted offline. */
export interface CodeMutation {
  /** Stable ID for this mutation. */
  id: string;
  /** File / exercise path this mutation belongs to. */
  path: string;
  /** Full content after the mutation (last-write wins within one device). */
  content: string;
  /** Lamport timestamp at the time of the mutation. */
  lamport: LamportTimestamp;
  /** Full vector clock snapshot at the time of the mutation. */
  vectorClock: VectorClock;
  /** Wall-clock creation time (ms since epoch). */
  createdAt: number;
  /** True while not yet acknowledged by the server. */
  pending: boolean;
}

/** A conflict surfaced during two-way sync. */
export interface SyncConflict {
  /** The path that has diverged. */
  path: string;
  /** The local (pending) version. */
  local: CodeMutation;
  /** The remote (server) version. */
  remote: RemoteSnapshot;
}

/** Snapshot returned by the backend for a single path. */
export interface RemoteSnapshot {
  path: string;
  content: string;
  lamport: LamportTimestamp;
  vectorClock: VectorClock;
  updatedAt: number;
}

/** Minimal adapter the SyncManager uses to talk to the backend. */
export interface SyncBackendAdapter {
  /**
   * Fetch the server's current snapshot for each path in `paths`.
   * Returns one entry per path that exists server-side.
   */
  fetchSnapshots(paths: string[]): Promise<RemoteSnapshot[]>;
  /**
   * Push a resolved mutation to the server.
   * The server should echo back its updated snapshot (or throw on conflict).
   */
  pushMutation(mutation: CodeMutation): Promise<RemoteSnapshot>;
}

// ---------------------------------------------------------------------------
// IndexedDB store name
// ---------------------------------------------------------------------------

const MUTATIONS_STORE = 'code_mutations';
const VECTOR_CLOCK_META_KEY = 'sync:vector-clock';
const LAMPORT_META_KEY = 'sync:lamport';
const DEVICE_ID_META_KEY = 'sync:device-id';
const DB_VERSION_BUMP = 4; // bump triggers onupgradeneeded in DatabaseManager

// ---------------------------------------------------------------------------
// SyncManager
// ---------------------------------------------------------------------------

export class SyncManager {
  private dbManager: DatabaseManager;
  private adapter: SyncBackendAdapter | null = null;
  private state: SyncState = 'idle';
  private listeners = new Set<(state: SyncState) => void>();
  private conflictListeners = new Set<(conflicts: SyncConflict[]) => void>();

  /** Cached device ID (stable per browser profile). */
  private _deviceId: string | null = null;

  /**
   * Unique suffix for the mutations IDB instance.  Allows tests to create
   * isolated managers without shared IDB state.
   */
  private readonly _dbSuffix: string;

  constructor(dbManager: DatabaseManager, dbSuffix?: string) {
    this.dbManager = dbManager;
    this._dbSuffix = dbSuffix ?? '';
  }

  // -------------------------------------------------------------------------
  // Adapter registration
  // -------------------------------------------------------------------------

  /** Attach a backend adapter; required before twoWaySync is called. */
  setAdapter(adapter: SyncBackendAdapter): void {
    this.adapter = adapter;
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  onConflict(listener: (conflicts: SyncConflict[]) => void): () => void {
    this.conflictListeners.add(listener);
    return () => this.conflictListeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  private setState(next: SyncState): void {
    if (this.state === next) return;
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }

  // -------------------------------------------------------------------------
  // Device / clock identity
  // -------------------------------------------------------------------------

  async getDeviceId(): Promise<string> {
    if (this._deviceId) return this._deviceId;
    const stored = await this.dbManager.getMetadata(DEVICE_ID_META_KEY);
    if (stored?.value) {
      this._deviceId = stored.value;
      return this._deviceId;
    }
    const id = generateId();
    await this.dbManager.setMetadata(DEVICE_ID_META_KEY, id);
    this._deviceId = id;
    return id;
  }

  async getLamport(): Promise<LamportTimestamp> {
    const stored = await this.dbManager.getMetadata(LAMPORT_META_KEY);
    return stored ? parseInt(stored.value, 10) : 0;
  }

  private async setLamport(tick: LamportTimestamp): Promise<void> {
    await this.dbManager.setMetadata(LAMPORT_META_KEY, String(tick));
  }

  async getVectorClock(): Promise<VectorClock> {
    const stored = await this.dbManager.getMetadata(VECTOR_CLOCK_META_KEY);
    if (!stored?.value) return {};
    try {
      return JSON.parse(stored.value) as VectorClock;
    } catch {
      return {};
    }
  }

  private async setVectorClock(vc: VectorClock): Promise<void> {
    await this.dbManager.setMetadata(VECTOR_CLOCK_META_KEY, JSON.stringify(vc));
  }

  /**
   * Advance local Lamport counter and vector clock entry for this device,
   * returning the updated values.
   */
  async tickClock(): Promise<{ lamport: LamportTimestamp; vectorClock: VectorClock }> {
    const deviceId = await this.getDeviceId();
    const lamport = (await this.getLamport()) + 1;
    const vc = await this.getVectorClock();
    vc[deviceId] = lamport;
    await Promise.all([this.setLamport(lamport), this.setVectorClock(vc)]);
    return { lamport, vectorClock: { ...vc } };
  }

  /**
   * Merge a remote vector clock into the local one (take component-wise max),
   * then advance the local entry. Used when receiving remote updates.
   */
  async mergeClock(remote: VectorClock): Promise<VectorClock> {
    const deviceId = await this.getDeviceId();
    const local = await this.getVectorClock();
    const merged: VectorClock = { ...local };
    for (const [id, tick] of Object.entries(remote)) {
      merged[id] = Math.max(merged[id] ?? 0, tick);
    }
    // Advance our own entry after the merge.
    merged[deviceId] = (merged[deviceId] ?? 0) + 1;
    await this.setVectorClock(merged);
    // Keep Lamport in sync.
    const maxRemote = Math.max(0, ...Object.values(remote));
    const local_lamport = await this.getLamport();
    const newLamport = Math.max(local_lamport, maxRemote) + 1;
    await this.setLamport(newLamport);
    return { ...merged };
  }

  // -------------------------------------------------------------------------
  // Mutation persistence (IndexedDB via DatabaseManager)
  // -------------------------------------------------------------------------

  /**
   * Persist a code-editor mutation.  Automatically ticks the vector clock.
   * Returns the stored mutation record.
   */
  async recordMutation(path: string, content: string): Promise<CodeMutation> {
    const { lamport, vectorClock } = await this.tickClock();
    const mutation: CodeMutation = {
      id: generateId(),
      path,
      content,
      lamport,
      vectorClock,
      createdAt: Date.now(),
      pending: true,
    };
    await this.writeMutation(mutation);
    return mutation;
  }

  async getPendingMutations(): Promise<CodeMutation[]> {
    const all = await this.readAllMutations();
    return all.filter((m) => m.pending);
  }

  async getAllMutations(): Promise<CodeMutation[]> {
    return this.readAllMutations();
  }

  async markMutationSynced(id: string): Promise<void> {
    const all = await this.readAllMutations();
    const mutation = all.find((m) => m.id === id);
    if (!mutation) return;
    await this.writeMutation({ ...mutation, pending: false });
  }

  async deleteMutation(id: string): Promise<void> {
    const db = await (this.dbManager as unknown as { openDb(): Promise<IDBDatabase> }).openDb?.();
    if (!db) {
      // Fallback: use metadata store with a prefixed key.
      return this.dbManager.setMetadata(`mutation-tombstone:${id}`, 'deleted');
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MUTATIONS_STORE, 'readwrite');
      tx.objectStore(MUTATIONS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // -------------------------------------------------------------------------
  // Two-way sync
  // -------------------------------------------------------------------------

  /**
   * Pull remote snapshots for every pending path, compare vector clocks,
   * push non-conflicting mutations, and surface conflicts to listeners.
   *
   * Returns `true` when sync completed without unresolved conflicts.
   */
  async twoWaySync(): Promise<boolean> {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      this.setState('offline');
      return false;
    }
    if (!this.adapter) {
      return false;
    }

    this.setState('syncing');

    try {
      const pending = await this.getPendingMutations();
      if (pending.length === 0) {
        this.setState('idle');
        return true;
      }

      // Deduplicate: for each path keep only the latest pending mutation.
      const latestByPath = new Map<string, CodeMutation>();
      for (const m of pending) {
        const existing = latestByPath.get(m.path);
        if (!existing || m.lamport > existing.lamport) {
          latestByPath.set(m.path, m);
        }
      }

      const paths = Array.from(latestByPath.keys());
      const remoteSnapshots = await this.adapter.fetchSnapshots(paths);
      const remoteByPath = new Map(remoteSnapshots.map((s) => [s.path, s]));

      const conflicts: SyncConflict[] = [];

      for (const entry of Array.from(latestByPath.entries())) {
        const [path, local] = entry;
        const remote = remoteByPath.get(path);

        if (!remote) {
          // Server has no record → push directly.
          const pushed = await this.adapter.pushMutation(local);
          await this.mergeClock(pushed.vectorClock);
          await this.markMutationSynced(local.id);
          continue;
        }

        const relation = compareVectorClocks(local.vectorClock, remote.vectorClock);

        if (relation === 'after' || relation === 'equal') {
          // Local is strictly newer → push wins.
          const pushed = await this.adapter.pushMutation(local);
          await this.mergeClock(pushed.vectorClock);
          await this.markMutationSynced(local.id);
        } else if (relation === 'before') {
          // Remote is strictly newer → accept remote, discard local pending.
          await this.mergeClock(remote.vectorClock);
          await this.markMutationSynced(local.id);
        } else {
          // Concurrent edits (concurrent) → conflict.
          conflicts.push({ path, local, remote });
        }
      }

      if (conflicts.length > 0) {
        this.setState('conflict');
        this.conflictListeners.forEach((l) => l(conflicts));
        return false;
      }

      this.setState('idle');
      return true;
    } catch (err) {
      console.error('[SyncManager] twoWaySync error:', err);
      this.setState('error');
      return false;
    }
  }

  /**
   * Resolve a conflict by picking a side or providing merged content.
   * Pushes the resolution to the server.
   */
  async resolveConflict(
    conflict: SyncConflict,
    resolution: 'mine' | 'theirs' | 'merged',
    mergedContent?: string,
  ): Promise<void> {
    if (!this.adapter) return;

    const content =
      resolution === 'mine'
        ? conflict.local.content
        : resolution === 'theirs'
          ? conflict.remote.content
          : (mergedContent ?? conflict.local.content);

    const { lamport, vectorClock } = await this.tickClock();
    const resolved: CodeMutation = {
      ...conflict.local,
      id: generateId(),
      content,
      lamport,
      vectorClock,
      createdAt: Date.now(),
      pending: true,
    };

    await this.writeMutation(resolved);
    try {
      const pushed = await this.adapter.pushMutation(resolved);
      await this.mergeClock(pushed.vectorClock);
      await this.markMutationSynced(resolved.id);
      // Also clear the original conflicting mutation.
      await this.markMutationSynced(conflict.local.id);
    } catch (err) {
      console.error('[SyncManager] resolveConflict push error:', err);
      this.setState('error');
    }

    // Re-evaluate overall state after resolution.
    const remaining = await this.getPendingMutations();
    if (remaining.length === 0) {
      this.setState('idle');
    }
  }

  // -------------------------------------------------------------------------
  // Legacy pending-change tracking (kept for backward compat with old API)
  // -------------------------------------------------------------------------

  private readonly PENDING_KEY = 'storage:pending-changes';

  trackPendingChange(changeId: string): void {
    const pending = this.getPendingChangeIds();
    if (!pending.includes(changeId)) {
      this.setPendingChangeIds([...pending, changeId]);
    }
  }

  resolvePendingChange(changeId: string): void {
    this.setPendingChangeIds(this.getPendingChangeIds().filter((id) => id !== changeId));
  }

  getPendingChangeIds(): string[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(this.PENDING_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private setPendingChangeIds(ids: string[]): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(this.PENDING_KEY, JSON.stringify(ids));
  }

  // Kept for backward compatibility — alias for getPendingChangeIds
  getPendingChanges(): string[] {
    return this.getPendingChangeIds();
  }

  // -------------------------------------------------------------------------
  // Yjs helpers (kept for backward compat)
  // -------------------------------------------------------------------------

  attachYDocPersistence(
    doc: import('yjs').Doc,
    storageKey: string,
  ): () => Promise<void> {
    // Lazy import to avoid bundling yjs unconditionally.
    let Y: typeof import('yjs');
    const persist = async () => {
      try {
        if (!Y) Y = await import('yjs');
        const update = Y.encodeStateAsUpdate(doc);
        const serialized = Array.from(update).join(',');
        await this.dbManager.setMetadata(`ydoc:${storageKey}`, serialized);
      } catch {
        this.setState('error');
      }
    };
    doc.on('update', persist);
    return async () => {
      doc.off('update', persist);
      await persist();
    };
  }

  async restoreYDoc(doc: import('yjs').Doc, storageKey: string): Promise<void> {
    let Y: typeof import('yjs');
    const stored = await this.dbManager.getMetadata(`ydoc:${storageKey}`);
    if (!stored?.value) return;
    if (!Y!) Y = await import('yjs');
    const bytes = new Uint8Array(stored.value.split(',').map(Number));
    if (bytes.length > 0) Y.applyUpdate(doc, bytes);
  }

  async syncPendingUploads(runUpload: (changeId: string) => Promise<void>): Promise<void> {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      this.setState('offline');
      return;
    }
    this.setState('syncing');
    try {
      const pending = this.getPendingChangeIds();
      for (const changeId of pending) {
        await runUpload(changeId);
        this.resolvePendingChange(changeId);
      }
      this.setState('idle');
    } catch {
      this.setState('error');
    }
  }

  // -------------------------------------------------------------------------
  // Private IDB helpers for the mutations store
  // -------------------------------------------------------------------------

  /**
   * We store mutations in the same IDB database managed by DatabaseManager
   * but in a dedicated object store. Because DatabaseManager's `openDb` is
   * private, we open our own handle on the same DB name, ensuring we
   * co-exist without conflicts.
   */
  private mutationDbPromise: Promise<IDBDatabase> | null = null;

  private openMutationDb(): Promise<IDBDatabase> {
    if (this.mutationDbPromise) return this.mutationDbPromise;
    this.mutationDbPromise = new Promise((resolve, reject) => {
      // Use a separate DB name to avoid bumping DatabaseManager's version.
      // The optional suffix lets tests create isolated stores.
      const dbName = this._dbSuffix
        ? `web3-student-lab-sync-${this._dbSuffix}`
        : 'web3-student-lab-sync';
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
          const store = db.createObjectStore(MUTATIONS_STORE, { keyPath: 'id' });
          store.createIndex('path', 'path', { unique: false });
          store.createIndex('pending', 'pending', { unique: false });
          store.createIndex('lamport', 'lamport', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open sync IDB'));
    });
    return this.mutationDbPromise;
  }

  private async writeMutation(mutation: CodeMutation): Promise<void> {
    const db = await this.openMutationDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MUTATIONS_STORE, 'readwrite');
      tx.objectStore(MUTATIONS_STORE).put(mutation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async readAllMutations(): Promise<CodeMutation[]> {
    const db = await this.openMutationDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MUTATIONS_STORE, 'readonly');
      const req = tx.objectStore(MUTATIONS_STORE).getAll();
      req.onsuccess = () => resolve((req.result as CodeMutation[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  }
}

// ---------------------------------------------------------------------------
// Utility: vector clock comparison
// ---------------------------------------------------------------------------

type ClockRelation = 'before' | 'after' | 'equal' | 'concurrent';

/**
 * Compare two vector clocks.
 *
 * Returns:
 *   'before'    — a happened-before b: every component of a ≤ b, at least one strictly less
 *   'after'     — a happened-after  b: every component of a ≥ b, at least one strictly greater
 *   'equal'     — all components identical
 *   'concurrent'— neither dominates (genuine conflict)
 *
 * Memory aid: "a is AFTER b" means a's ticks are all at least as large as b's —
 * a has observed everything b has, and more.
 */
export function compareVectorClocks(a: VectorClock, b: VectorClock): ClockRelation {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  // aGe: a[k] >= b[k] for all k  (a could be after b)
  // bGe: b[k] >= a[k] for all k  (b could be after a)
  let aGe = true;
  let bGe = true;

  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (av < bv) aGe = false;
    if (bv < av) bGe = false;
  }

  if (aGe && bGe) return 'equal';
  if (aGe) return 'after';   // a ≥ b everywhere, so a happened after b
  if (bGe) return 'before';  // b ≥ a everywhere, so a happened before b
  return 'concurrent';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _singleton: SyncManager | null = null;

export function getSyncManager(): SyncManager {
  if (!_singleton) {
    const { DatabaseManager } = require('@/lib/storage/DatabaseManager') as {
      DatabaseManager: new () => DatabaseManager;
    };
    _singleton = new SyncManager(new DatabaseManager());
  }
  return _singleton;
}
