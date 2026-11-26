/**
 * useOfflineSync tests — FE-070
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineSync } from '../useOfflineSync';
import type { SyncBackendAdapter, RemoteSnapshot, CodeMutation } from '@/lib/storage/SyncManager';

// Reset the SyncManager singleton between tests so each test gets a clean state.
let _mockSyncInstance: ReturnType<typeof import('@/lib/storage/SyncManager').getSyncManager> | null = null;
let _mockCounter = 0;

vi.mock('@/lib/storage/SyncManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/SyncManager')>();
  const { DatabaseManager } = await import('@/lib/storage/DatabaseManager');

  return {
    ...actual,
    getSyncManager: () => {
      if (!_mockSyncInstance) {
        _mockCounter++;
        _mockSyncInstance = new actual.SyncManager(
          new DatabaseManager(),
          `hook-test-${_mockCounter}`,
        );
      }
      return _mockSyncInstance;
    },
  };
});

// Stub service-worker-sync to avoid SW registration side-effects in tests.
vi.mock('@/lib/service-worker-sync', () => ({
  requestBackgroundSync: vi.fn().mockResolvedValue(false),
  SYNC_TAG: 'w3sl-sync',
  CORE_OFFLINE_URLS: [],
  isBackgroundSyncSupported: vi.fn(() => false),
  prefetchOfflineUrls: vi.fn(),
}));

function makeAdapter(snapshots: RemoteSnapshot[] = []): SyncBackendAdapter {
  return {
    fetchSnapshots: vi.fn(async () => snapshots),
    pushMutation: vi.fn(async (m: CodeMutation) => ({
      path: m.path,
      content: m.content,
      lamport: m.lamport + 1,
      vectorClock: { ...m.vectorClock },
      updatedAt: Date.now(),
    })),
  };
}

describe('useOfflineSync', () => {
  beforeEach(() => {
    // Reset the manager instance so each test starts with a clean IDB.
    _mockSyncInstance = null;
    // Start online.
    Object.defineProperty(window.navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns isOnline=true when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOfflineSync());
    expect(result.current.isOnline).toBe(true);
  });

  it('records a mutation and increments pendingCount', async () => {
    const { result } = renderHook(() => useOfflineSync());

    await act(async () => {
      await result.current.recordMutation('/test.sol', 'pragma solidity ^0.8.0;');
    });

    expect(result.current.pendingCount).toBeGreaterThan(0);
  });

  it('calls adapter.pushMutation when triggerSync is called online', async () => {
    const adapter = makeAdapter([]);
    const { result } = renderHook(() => useOfflineSync({ adapter }));

    await act(async () => {
      await result.current.recordMutation('/push.sol', 'code');
    });

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(adapter.pushMutation).toHaveBeenCalledOnce();
  });

  it('does not push when offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const adapter = makeAdapter([]);
    const { result } = renderHook(() => useOfflineSync({ adapter }));

    await act(async () => {
      await result.current.recordMutation('/offline.sol', 'code');
    });

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(adapter.pushMutation).not.toHaveBeenCalled();
  });

  it('removes conflict from list after resolving', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useOfflineSync({ adapter }));

    // Manufacture a conflict scenario by injecting it via the conflict listener.
    // This tests the resolveConflict → setConflicts path without depending on
    // the full vector-clock machinery being wired through the hook.
    const { getSyncManager } = await import('@/lib/storage/SyncManager');
    const mgr = getSyncManager();

    // Record a mutation so there is something to sync.
    await act(async () => {
      await result.current.recordMutation('/conflict-resolve.sol', 'local');
    });

    // Directly emit a conflict through the manager to simulate concurrent edits.
    const fakeConflict = {
      path: '/conflict-resolve.sol',
      local: await mgr.getPendingMutations().then((p) => p[0]),
      remote: {
        path: '/conflict-resolve.sol',
        content: 'remote',
        lamport: 999,
        vectorClock: { 'other': 999 },
        updatedAt: Date.now(),
      },
    };

    // Set the adapter to return the concurrent remote snapshot.
    adapter.fetchSnapshots = vi.fn(async () => [fakeConflict.remote]);

    // Trigger sync to cause conflict detection.
    await act(async () => {
      await result.current.triggerSync();
    });

    // Conflicts should now be populated.
    await waitFor(() => {
      expect(result.current.conflicts.length).toBeGreaterThan(0);
    });

    const conflict = result.current.conflicts[0];

    // Resolve — should clear from conflicts array.
    await act(async () => {
      await result.current.resolveConflict(conflict, 'mine');
    });

    expect(result.current.conflicts.find((c) => c.path === conflict.path)).toBeUndefined();
  });

  it('dismissConflict removes conflict without resolving', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useOfflineSync({ adapter }));

    await act(async () => {
      await result.current.recordMutation('/dismiss.sol', 'local');
    });

    adapter.fetchSnapshots = vi.fn(async () => [
      {
        path: '/dismiss.sol',
        content: 'remote',
        lamport: 999,
        vectorClock: { 'other': 999 },
        updatedAt: Date.now(),
      },
    ]);

    await act(async () => {
      await result.current.triggerSync();
    });

    await waitFor(() => expect(result.current.conflicts.length).toBeGreaterThan(0));

    const conflict = result.current.conflicts[0];
    act(() => result.current.dismissConflict(conflict));

    expect(result.current.conflicts.find((c) => c.path === conflict.path)).toBeUndefined();
  });

  it('calls onSyncComplete after a clean sync', async () => {
    const onSyncComplete = vi.fn();
    const adapter = makeAdapter([]);
    const { result } = renderHook(() => useOfflineSync({ adapter, onSyncComplete }));

    await act(async () => {
      await result.current.recordMutation('/done.sol', 'done');
    });

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(onSyncComplete).toHaveBeenCalled();
  });
});
