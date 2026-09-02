/**
 * Integration test: WebSocket disconnect → local edits → reconnect → replay
 *
 * This test exercises the full flow that the acceptance criteria require:
 *
 *  1. Provider connects successfully.
 *  2. Provider disconnects (network failure simulation).
 *  3. Student makes several local canvas edits while offline.
 *  4. Provider reconnects.
 *  5. Pending updates are replayed into the shared Y.Doc without duplicates.
 *  6. pendingUpdateCount returns to 0.
 *  7. If the remote document advanced while offline, hasConflict is set.
 *  8. dismissConflict() clears the flag.
 *
 * Because these are integration tests the mock is intentionally thinner than
 * in the unit-test file: we let most of the hook logic run as-is and only
 * stub the actual WebSocket transport.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Controllable WebsocketProvider mock
// ---------------------------------------------------------------------------

interface StatusListener {
  (arg: { status: string }): void;
}

class MockProvider {
  doc: Y.Doc;
  awareness = {
    setLocalState: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getStates: vi.fn().mockReturnValue(new Map()),
    clientID: 42,
  };

  wsconnected = false;
  private statusListeners: StatusListener[] = [];
  private allListeners = new Map<string, Set<(arg: any) => void>>();

  on(event: string, cb: (arg: any) => void) {
    if (!this.allListeners.has(event)) this.allListeners.set(event, new Set());
    this.allListeners.get(event)!.add(cb);
    if (event === 'status') this.statusListeners.push(cb as StatusListener);
  }

  off(event: string, cb: (arg: any) => void) {
    this.allListeners.get(event)?.delete(cb);
    if (event === 'status') {
      this.statusListeners = this.statusListeners.filter((h) => h !== cb);
    }
  }

  connect = vi.fn(() => {
    this.wsconnected = true;
    this._emit('connected');
  });

  disconnect = vi.fn(() => {
    this.wsconnected = false;
    this._emit('disconnected');
  });

  destroy = vi.fn();

  constructor(_url: string, _room: string, doc: Y.Doc) {
    this.doc = doc;
  }

  _emit(status: string) {
    this.statusListeners.forEach((h) => h({ status }));
  }
}

let currentProvider: MockProvider | null = null;

vi.mock('y-websocket', () => ({
  WebsocketProvider: class extends MockProvider {
    constructor(url: string, room: string, doc: Y.Doc) {
      super(url, room, doc);
      currentProvider = this;
    }
  },
}));

// ---------------------------------------------------------------------------
// Clear registry between tests
// ---------------------------------------------------------------------------
afterEach(async () => {
  const { _providerRegistry } = await import('@/hooks/useCollaborativeEditor');
  _providerRegistry.clear();
  currentProvider = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: perform a Y.Doc edit that originates locally (not from provider)
// ---------------------------------------------------------------------------
function applyLocalEdit(doc: Y.Doc, nodeId: string) {
  doc.transact(() => {
    doc.getArray('nodes').push([{ id: nodeId, position: { x: 0, y: 0 } }]);
  });
  // origin is undefined (local) so the hook's update handler will queue it
}

// ---------------------------------------------------------------------------
// Integration scenarios
// ---------------------------------------------------------------------------

describe('Collaborative editor reconnect integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  it('scenario: connect → edit online → no queue growth', async () => {
    const { useCollaborativeEditor } = await import('@/hooks/useCollaborativeEditor');
    const { result } = renderHook(() => useCollaborativeEditor('int-room-1', 'int-user-1'));

    // Connect
    await act(async () => {
      currentProvider!._emit('connected');
    });

    expect(result.current.isConnected).toBe(true);

    // Make an edit while connected — should NOT enter the queue
    await act(async () => {
      applyLocalEdit(result.current.doc!, 'node-online-1');
    });

    expect(result.current.pendingUpdateCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  it('scenario: disconnect → local edits queue → reconnect → queue drained', async () => {
    const { useCollaborativeEditor } = await import('@/hooks/useCollaborativeEditor');
    const { result } = renderHook(() => useCollaborativeEditor('int-room-2', 'int-user-2'));

    // 1. Connect
    await act(async () => {
      currentProvider!._emit('connected');
    });

    // 2. Drop connection
    await act(async () => {
      currentProvider!._emit('disconnected');
    });

    expect(result.current.isConnected).toBe(false);

    // 3. Make local edits while offline
    await act(async () => {
      applyLocalEdit(result.current.doc!, 'node-offline-A');
      applyLocalEdit(result.current.doc!, 'node-offline-B');
    });

    expect(result.current.pendingUpdateCount).toBeGreaterThanOrEqual(1);

    // 4. Reconnect
    await act(async () => {
      currentProvider!._emit('connected');
    });

    // 5. Queue should be drained
    expect(result.current.pendingUpdateCount).toBe(0);
    expect(result.current.isConnected).toBe(true);
  });

  // -------------------------------------------------------------------------
  it('scenario: duplicate updates from same edit are not replayed twice', async () => {
    const { useCollaborativeEditor } = await import('@/hooks/useCollaborativeEditor');
    const { result } = renderHook(() => useCollaborativeEditor('int-room-3', 'int-user-3'));

    await act(async () => { currentProvider!._emit('connected'); });
    await act(async () => { currentProvider!._emit('disconnected'); });

    const doc = result.current.doc!;
    const nodesStart = doc.getArray('nodes').length;

    // Enqueue the same edit twice via PendingUpdateQueue (simulated by emitting
    // the exact same encoded update bytes).
    const { PendingUpdateQueue } = await import('@/lib/collaboration/PendingUpdateQueue');
    const q = new PendingUpdateQueue();

    // Construct a single update
    const before = Y.encodeStateAsUpdate(doc);
    doc.transact(() => {
      doc.getArray('nodes').push([{ id: 'dedup-node', position: { x: 1, y: 1 } }]);
    });
    const after = Y.encodeStateAsUpdate(doc);

    // Compute delta (simplified: just use after as the update)
    q.enqueue(after);
    q.enqueue(after); // duplicate — should be ignored

    // Queue should have exactly 1 entry
    expect(q.size).toBe(1);

    // Apply to a fresh doc to confirm only one mutation
    const testDoc = new Y.Doc();
    Y.applyUpdate(testDoc, before);
    const applied = q.replayInto(testDoc);

    expect(applied).toBe(1);
    // After applying the single update the node should exist exactly once
    const nodes = testDoc.getArray('nodes').toArray();
    const dedupNodes = nodes.filter((n: any) => n.id === 'dedup-node');
    expect(dedupNodes.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  it('scenario: reconnect() helper triggers provider.connect()', async () => {
    const { useCollaborativeEditor } = await import('@/hooks/useCollaborativeEditor');
    const { result } = renderHook(() => useCollaborativeEditor('int-room-4', 'int-user-4'));

    await act(async () => { currentProvider!._emit('disconnected'); });

    act(() => { result.current.reconnect(); });

    expect(currentProvider!.connect).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it('scenario: teardown stops sync – provider destroyed after unmount', async () => {
    const { useCollaborativeEditor } = await import('@/hooks/useCollaborativeEditor');
    const { unmount } = renderHook(() => useCollaborativeEditor('int-room-5', 'int-user-5'));

    const provider = currentProvider!;

    unmount();

    expect(provider.disconnect).toHaveBeenCalled();
    expect(provider.destroy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it('scenario: conflict flag raised when remote doc advanced while offline', async () => {
    const { useCollaborativeEditor } = await import('@/hooks/useCollaborativeEditor');
    const { result } = renderHook(() => useCollaborativeEditor('int-room-6', 'int-user-6'));

    await act(async () => { currentProvider!._emit('connected'); });

    // Go offline
    await act(async () => { currentProvider!._emit('disconnected'); });

    const doc = result.current.doc!;

    // Simulate a local edit while offline so the queue is non-empty
    await act(async () => {
      applyLocalEdit(doc, 'my-offline-node');
    });

    // Simulate a remote peer advancing the doc (using provider as origin
    // so the hook's update listener ignores it for queueing)
    doc.transact(() => {
      doc.getArray('nodes').push([{ id: 'remote-peer-node' }]);
    }, currentProvider);

    // Reconnect — hook should detect that the remote vector changed
    await act(async () => {
      currentProvider!._emit('connected');
    });

    // hasConflict should be true because the remote doc advanced while we were offline
    expect(result.current.hasConflict).toBe(true);

    // Dismiss the conflict
    act(() => { result.current.dismissConflict(); });
    expect(result.current.hasConflict).toBe(false);
  });

  // -------------------------------------------------------------------------
  it('scenario: PendingUpdateQueue caps at MAX_QUEUE_SIZE=100 without throwing', async () => {
    const { PendingUpdateQueue } = await import('@/lib/collaboration/PendingUpdateQueue');
    const q = new PendingUpdateQueue();

    // Enqueue 150 distinct updates (each with a unique first byte to avoid dedup)
    for (let i = 0; i < 150; i++) {
      const update = new Uint8Array(32);
      update[0] = i % 256;
      update[1] = Math.floor(i / 256);
      update[2] = i;
      q.enqueue(update);
    }

    // Size should be capped at 100
    expect(q.size).toBe(100);
  });

  // -------------------------------------------------------------------------
  it('scenario: PendingUpdateQueue.clear() empties the queue', async () => {
    const { PendingUpdateQueue } = await import('@/lib/collaboration/PendingUpdateQueue');
    const q = new PendingUpdateQueue();

    q.enqueue(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
    q.enqueue(new Uint8Array([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]));

    expect(q.size).toBe(2);

    q.clear();

    expect(q.size).toBe(0);
  });
});
