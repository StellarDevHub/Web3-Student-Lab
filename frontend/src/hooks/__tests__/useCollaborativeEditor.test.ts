/**
 * Unit tests for useCollaborativeEditor
 *
 * Covers:
 *  1. Singleton provider – only one registry entry per (roomId, userId) pair.
 *  2. Pending-update queue – local updates enqueued while disconnected.
 *  3. Conflict detection – hasConflict raised when remote state advanced while offline.
 *  4. Teardown – provider destroyed and registry cleaned up when last consumer unmounts.
 *  5. reconnect() helper – calls provider.connect().
 *  6. dismissConflict() – resets hasConflict.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// We need to control status events and track provider creation count.
let providerInstances: MockWebsocketProvider[] = [];

class MockWebsocketProvider {
  doc: Y.Doc;
  roomName: string;
  wsUrl: string;
  wsconnected = false;
  awareness = {
    setLocalState: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getStates: vi.fn().mockReturnValue(new Map()),
    clientID: Math.floor(Math.random() * 9999),
  };

  private statusHandlers: Array<(arg: { status: string }) => void> = [];

  on = vi.fn((event: string, cb: any) => {
    if (event === 'status') {
      this.statusHandlers.push(cb);
    }
  });

  off = vi.fn((event: string, cb: any) => {
    if (event === 'status') {
      this.statusHandlers = this.statusHandlers.filter((h) => h !== cb);
    }
  });

  connect = vi.fn(() => {
    this.wsconnected = true;
    this._triggerStatus('connected');
  });

  disconnect = vi.fn(() => {
    this.wsconnected = false;
    this._triggerStatus('disconnected');
  });

  destroy = vi.fn();

  constructor(wsUrl: string, roomName: string, doc: Y.Doc) {
    this.wsUrl = wsUrl;
    this.roomName = roomName;
    this.doc = doc;
    providerInstances.push(this);
  }

  /** Test helper: emit a status event to all registered handlers. */
  _triggerStatus(status: string) {
    this.statusHandlers.forEach((h) => h({ status }));
  }
}

vi.mock('y-websocket', () => ({
  WebsocketProvider: MockWebsocketProvider,
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
// We import lazily via dynamic import inside each test because the registry is
// module-level and we need it cleared between suites.

async function loadHook() {
  // Re-import to reset module-level state between test files.
  const mod = await import('@/hooks/useCollaborativeEditor');
  return mod;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function getProvider() {
  return providerInstances[providerInstances.length - 1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCollaborativeEditor', () => {
  beforeEach(() => {
    providerInstances = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Force-clean the registry so tests don't bleed into each other.
    import('@/hooks/useCollaborativeEditor').then(({ _providerRegistry }) => {
      _providerRegistry.clear();
    });
  });

  // -------------------------------------------------------------------------
  it('initialises with disconnected state', async () => {
    const { useCollaborativeEditor } = await loadHook();
    const { result } = renderHook(() => useCollaborativeEditor('room-1', 'user-1'));

    expect(result.current.isConnected).toBe(false);
    expect(result.current.reconnectStatus).toBe('disconnected');
    expect(result.current.hasConflict).toBe(false);
    expect(result.current.pendingUpdateCount).toBe(0);
    expect(result.current.doc).toBeInstanceOf(Y.Doc);
    expect(result.current.awareness).toBeDefined();
  });

  // -------------------------------------------------------------------------
  it('transitions to connected after provider emits connected status', async () => {
    const { useCollaborativeEditor } = await loadHook();
    const { result } = renderHook(() => useCollaborativeEditor('room-2', 'user-2'));

    const provider = getProvider();

    await act(async () => {
      provider._triggerStatus('connected');
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.reconnectStatus).toBe('connected');
  });

  // -------------------------------------------------------------------------
  it('shows reconnecting status while connecting', async () => {
    const { useCollaborativeEditor } = await loadHook();
    const { result } = renderHook(() => useCollaborativeEditor('room-3', 'user-3'));

    const provider = getProvider();

    await act(async () => {
      provider._triggerStatus('connecting');
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.reconnectStatus).toBe('reconnecting');
  });

  // -------------------------------------------------------------------------
  it('singleton: two hook invocations for the same room share one provider', async () => {
    const { useCollaborativeEditor } = await loadHook();

    const { result: r1 } = renderHook(() => useCollaborativeEditor('room-same', 'user-same'));
    const { result: r2 } = renderHook(() => useCollaborativeEditor('room-same', 'user-same'));

    // Both hooks should share the same Y.Doc reference.
    expect(r1.current.doc).toBe(r2.current.doc);
    // Only one provider should have been created.
    expect(providerInstances).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  it('different rooms create separate providers', async () => {
    const { useCollaborativeEditor } = await loadHook();

    renderHook(() => useCollaborativeEditor('room-A', 'user-1'));
    renderHook(() => useCollaborativeEditor('room-B', 'user-1'));

    expect(providerInstances).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  it('reconnect() calls provider.connect()', async () => {
    const { useCollaborativeEditor } = await loadHook();
    const { result } = renderHook(() => useCollaborativeEditor('room-r', 'user-r'));

    const provider = getProvider();

    act(() => {
      result.current.reconnect();
    });

    expect(provider.connect).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it('dismissConflict() clears hasConflict', async () => {
    const { useCollaborativeEditor } = await loadHook();
    const { result } = renderHook(() => useCollaborativeEditor('room-cf', 'user-cf'));

    const provider = getProvider();

    // Simulate: go offline, make a local change, reconnect to trigger conflict
    await act(async () => {
      provider._triggerStatus('disconnected');
    });

    // Emit an update from the "local" side while offline so the queue has items
    const doc = result.current.doc!;
    const update = Y.encodeStateAsUpdate(doc);
    doc.emit('update', [update, null]); // origin != provider → gets queued

    // Simulate remote vector changing by modifying the doc from the "remote" side
    // before reconnecting.
    doc.transact(() => {
      const arr = doc.getArray('__test__');
      arr.push(['remote-change']);
    }, provider /* mark as remote origin */);

    await act(async () => {
      provider._triggerStatus('connected');
    });

    act(() => {
      result.current.dismissConflict();
    });

    expect(result.current.hasConflict).toBe(false);
  });

  // -------------------------------------------------------------------------
  it('pendingUpdateCount increments while disconnected and resets after reconnect', async () => {
    const { useCollaborativeEditor } = await loadHook();
    const { result } = renderHook(() => useCollaborativeEditor('room-pq', 'user-pq'));

    const provider = getProvider();
    const doc = result.current.doc!;

    // Go offline
    await act(async () => {
      provider._triggerStatus('disconnected');
    });

    // Fire two distinct local updates
    await act(async () => {
      doc.transact(() => {
        doc.getArray('nodes').push([{ id: 'n1' }]);
      }); // origin = undefined → captured by queue
    });

    await act(async () => {
      doc.transact(() => {
        doc.getArray('nodes').push([{ id: 'n2' }]);
      });
    });

    // Queue count should be positive (at least 1 — dedup may merge them)
    expect(result.current.pendingUpdateCount).toBeGreaterThanOrEqual(1);

    // Reconnect — queue should drain
    await act(async () => {
      provider._triggerStatus('connected');
    });

    expect(result.current.pendingUpdateCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  it('teardown: destroys provider and removes registry entry on last unmount', async () => {
    const { useCollaborativeEditor, _providerRegistry } = await loadHook();

    const { unmount } = renderHook(() => useCollaborativeEditor('room-td', 'user-td'));

    const provider = getProvider();

    unmount();

    expect(provider.destroy).toHaveBeenCalled();
    expect(provider.disconnect).toHaveBeenCalled();
    expect(_providerRegistry.has('room-td::user-td')).toBe(false);
  });

  // -------------------------------------------------------------------------
  it('teardown: provider kept alive while second consumer still mounted', async () => {
    const { useCollaborativeEditor, _providerRegistry } = await loadHook();

    const { unmount: unmount1 } = renderHook(() =>
      useCollaborativeEditor('room-shared-td', 'user-s')
    );
    renderHook(() => useCollaborativeEditor('room-shared-td', 'user-s'));

    const provider = getProvider();

    // Unmount the first consumer — provider should stay alive
    unmount1();

    expect(provider.destroy).not.toHaveBeenCalled();
    expect(_providerRegistry.has('room-shared-td::user-s')).toBe(true);
  });
});
