/**
 * SyncManager tests — FE-070
 *
 * Uses fake-indexeddb (auto-loaded in test/setup.ts) so all IDB calls run
 * in-memory without a real browser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SyncManager,
  compareVectorClocks,
  type VectorClock,
  type RemoteSnapshot,
  type CodeMutation,
  type SyncConflict,
  type SyncBackendAdapter,
} from '../SyncManager';
import { DatabaseManager } from '../DatabaseManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _testCounter = 0;
function makeManager(): SyncManager {
  _testCounter++;
  // Each manager gets a unique DB suffix so tests don't share IDB state.
  return new SyncManager(new DatabaseManager(), `test-${_testCounter}`);
}

function makeAdapter(
  snapshots: RemoteSnapshot[] = [],
  pushResult?: (m: CodeMutation) => RemoteSnapshot,
): SyncBackendAdapter {
  return {
    fetchSnapshots: vi.fn(async () => snapshots),
    pushMutation: vi.fn(async (m) =>
      pushResult
        ? pushResult(m)
        : ({
            path: m.path,
            content: m.content,
            lamport: m.lamport + 1,
            vectorClock: { ...m.vectorClock },
            updatedAt: Date.now(),
          } satisfies RemoteSnapshot),
    ),
  };
}

// ---------------------------------------------------------------------------
// compareVectorClocks
// ---------------------------------------------------------------------------

describe('compareVectorClocks', () => {
  it('equal when both clocks are empty', () => {
    expect(compareVectorClocks({}, {})).toBe('equal');
  });

  it('equal when clocks have same entries', () => {
    const a: VectorClock = { dev1: 3, dev2: 1 };
    const b: VectorClock = { dev1: 3, dev2: 1 };
    expect(compareVectorClocks(a, b)).toBe('equal');
  });

  it('after when a dominates b', () => {
    const a: VectorClock = { dev1: 5, dev2: 2 };
    const b: VectorClock = { dev1: 3, dev2: 2 };
    expect(compareVectorClocks(a, b)).toBe('after');
  });

  it('before when b dominates a', () => {
    const a: VectorClock = { dev1: 1 };
    const b: VectorClock = { dev1: 5 };
    expect(compareVectorClocks(a, b)).toBe('before');
  });

  it('concurrent when neither dominates', () => {
    const a: VectorClock = { dev1: 5, dev2: 1 };
    const b: VectorClock = { dev1: 2, dev2: 4 };
    expect(compareVectorClocks(a, b)).toBe('concurrent');
  });

  it('treats missing keys as 0', () => {
    // a has key dev1=1; b has key dev2=1 — concurrent
    const a: VectorClock = { dev1: 1 };
    const b: VectorClock = { dev2: 1 };
    expect(compareVectorClocks(a, b)).toBe('concurrent');
  });
});

// ---------------------------------------------------------------------------
// Clock management
// ---------------------------------------------------------------------------

describe('SyncManager — clock management', () => {
  it('ticks Lamport counter on each call', async () => {
    const mgr = makeManager();
    const { lamport: t1 } = await mgr.tickClock();
    const { lamport: t2 } = await mgr.tickClock();
    expect(t2).toBeGreaterThan(t1);
  });

  it('records device id in vector clock after tick', async () => {
    const mgr = makeManager();
    const deviceId = await mgr.getDeviceId();
    const { vectorClock } = await mgr.tickClock();
    expect(vectorClock[deviceId]).toBeGreaterThan(0);
  });

  it('mergeClock takes component-wise max', async () => {
    const mgr = makeManager();
    // Advance local clock once.
    await mgr.tickClock();
    const deviceId = await mgr.getDeviceId();

    const remote: VectorClock = { 'other-device': 10, [deviceId]: 1 };
    const merged = await mgr.mergeClock(remote);

    expect(merged['other-device']).toBe(10);
    // Our local entry should be advanced beyond the remote's value.
    expect(merged[deviceId]).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Mutation persistence
// ---------------------------------------------------------------------------

describe('SyncManager — mutation persistence', () => {
  it('recordMutation stores a pending mutation', async () => {
    const mgr = makeManager();
    const mutation = await mgr.recordMutation('/exercise/hello.rs', 'fn main() {}');

    expect(mutation.path).toBe('/exercise/hello.rs');
    expect(mutation.content).toBe('fn main() {}');
    expect(mutation.pending).toBe(true);
    expect(mutation.lamport).toBeGreaterThan(0);
  });

  it('getPendingMutations returns only pending ones', async () => {
    const mgr = makeManager();
    await mgr.recordMutation('/a.sol', 'v1');
    await mgr.recordMutation('/b.sol', 'v1');

    const pending = await mgr.getPendingMutations();
    expect(pending).toHaveLength(2);

    await mgr.markMutationSynced(pending[0].id);
    const stillPending = await mgr.getPendingMutations();
    expect(stillPending).toHaveLength(1);
  });

  it('stored mutations are retrievable after writing', async () => {
    const mgr = makeManager();
    await mgr.recordMutation('/persist.sol', 'content');
    await mgr.recordMutation('/persist2.sol', 'more content');

    const all = await mgr.getAllMutations();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some((m) => m.path === '/persist.sol')).toBe(true);
    expect(all.some((m) => m.path === '/persist2.sol')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Two-way sync — no conflict
// ---------------------------------------------------------------------------

describe('SyncManager — twoWaySync (no conflict)', () => {
  it('pushes pending mutation when server has no record', async () => {
    const mgr = makeManager();
    const adapter = makeAdapter([]);
    mgr.setAdapter(adapter);

    await mgr.recordMutation('/new.sol', 'code');
    const ok = await mgr.twoWaySync();

    expect(ok).toBe(true);
    expect(adapter.pushMutation).toHaveBeenCalledOnce();
    const pending = await mgr.getPendingMutations();
    expect(pending).toHaveLength(0);
  });

  it('marks mutation synced when remote is strictly newer', async () => {
    const mgr = makeManager();
    const deviceId = await mgr.getDeviceId();

    // Record a mutation with clock { deviceId: 1 }.
    await mgr.recordMutation('/existing.sol', 'local');

    // Server has the same path with a strictly higher value for the SAME device key.
    // This makes local's clock strictly dominated by remote's (local is 'before' remote).
    const localVC = (await mgr.getPendingMutations())[0].vectorClock;
    const remoteVC = { ...localVC, [deviceId]: (localVC[deviceId] ?? 1) + 100 };

    const remoteSnapshot: RemoteSnapshot = {
      path: '/existing.sol',
      content: 'server-latest',
      lamport: 999,
      vectorClock: remoteVC,
      updatedAt: Date.now(),
    };
    const adapter = makeAdapter([remoteSnapshot]);
    mgr.setAdapter(adapter);

    const ok = await mgr.twoWaySync();
    expect(ok).toBe(true);
    expect(adapter.pushMutation).not.toHaveBeenCalled();
    const pending = await mgr.getPendingMutations();
    expect(pending).toHaveLength(0);
  });

  it('pushes when local is strictly newer than remote', async () => {
    const mgr = makeManager();
    // Record two mutations so the local clock advances.
    await mgr.recordMutation('/ahead.sol', 'v1');
    await mgr.recordMutation('/ahead.sol', 'v2');
    const localMutations = await mgr.getPendingMutations();
    // The latest pending mutation for /ahead.sol has the advanced vector clock.
    const latestLocal = localMutations
      .filter((m) => m.path === '/ahead.sol')
      .sort((a, b) => b.lamport - a.lamport)[0];

    // Build a remote snapshot that is strictly dominated by the local clock:
    // copy the local VC and subtract from every entry.
    const remoteVC: VectorClock = {};
    for (const [key, val] of Object.entries(latestLocal.vectorClock)) {
      remoteVC[key] = Math.max(0, val - 10);
    }

    const remoteSnapshot: RemoteSnapshot = {
      path: '/ahead.sol',
      content: 'old-server',
      lamport: 1,
      vectorClock: remoteVC,
      updatedAt: Date.now() - 10_000,
    };
    const adapter = makeAdapter([remoteSnapshot]);
    mgr.setAdapter(adapter);

    const ok = await mgr.twoWaySync();
    expect(ok).toBe(true);
    expect(adapter.pushMutation).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Two-way sync — conflict detection
// ---------------------------------------------------------------------------

describe('SyncManager — twoWaySync (conflict)', () => {
  it('emits a conflict when clocks are concurrent', async () => {
    const mgr = makeManager();

    // Local mutation from device A.
    const mutation = await mgr.recordMutation('/conflict.sol', 'device-A change');

    // Remote mutation from device B (concurrent — different key with higher value).
    const remoteSnapshot: RemoteSnapshot = {
      path: '/conflict.sol',
      content: 'device-B change',
      lamport: 5,
      // device-B is ahead in its own component; device-A's component is unknown to B.
      vectorClock: { 'device-B': 5 },
      updatedAt: Date.now(),
    };
    const adapter = makeAdapter([remoteSnapshot]);
    mgr.setAdapter(adapter);

    const conflicts: SyncConflict[] = [];
    mgr.onConflict((c) => { conflicts.push(...c); });

    // local vector clock has the manager's own device key > 0, 'device-B' missing (=0).
    // remote vector clock has 'device-B': 5, manager device key missing (=0).
    // → concurrent.
    const ok = await mgr.twoWaySync();

    expect(ok).toBe(false);
    expect(conflicts.length).toBeGreaterThan(0);
    expect((conflicts[0] as unknown as SyncConflict).path).toBe('/conflict.sol');
  });

  it('sets state to "conflict" on concurrent edits', async () => {
    const mgr = makeManager();
    await mgr.recordMutation('/c.sol', 'local');

    const remoteSnapshot: RemoteSnapshot = {
      path: '/c.sol',
      content: 'remote',
      lamport: 99,
      vectorClock: { 'some-other-device': 99 },
      updatedAt: Date.now(),
    };
    const adapter = makeAdapter([remoteSnapshot]);
    mgr.setAdapter(adapter);

    await mgr.twoWaySync();
    expect(mgr.getState()).toBe('conflict');
  });
});

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

describe('SyncManager — resolveConflict', () => {
  it('resolves "mine" and pushes local content', async () => {
    const mgr = makeManager();
    const mutation = await mgr.recordMutation('/res.sol', 'my content');

    const remote: RemoteSnapshot = {
      path: '/res.sol',
      content: 'their content',
      lamport: 99,
      vectorClock: { 'other-device': 99 },
      updatedAt: Date.now(),
    };
    const adapter = makeAdapter([remote]);
    mgr.setAdapter(adapter);

    const detectedConflicts: SyncConflict[] = [];
    mgr.onConflict((c) => detectedConflicts.push(...c));
    await mgr.twoWaySync();
    expect(detectedConflicts).toHaveLength(1);

    await mgr.resolveConflict(detectedConflicts[0], 'mine');

    const pushCalls = (adapter.pushMutation as ReturnType<typeof vi.fn>).mock.calls;
    const lastPush = pushCalls[pushCalls.length - 1][0] as CodeMutation;
    expect(lastPush.content).toBe('my content');
  });

  it('resolves "theirs" and pushes remote content', async () => {
    const mgr = makeManager();
    await mgr.recordMutation('/res2.sol', 'my content');

    const remote: RemoteSnapshot = {
      path: '/res2.sol',
      content: 'their content',
      lamport: 99,
      vectorClock: { 'other-device': 99 },
      updatedAt: Date.now(),
    };
    const adapter = makeAdapter([remote]);
    mgr.setAdapter(adapter);

    const detectedConflicts: SyncConflict[] = [];
    mgr.onConflict((c) => detectedConflicts.push(...c));
    await mgr.twoWaySync();

    await mgr.resolveConflict(detectedConflicts[0], 'theirs');

    const pushCalls = (adapter.pushMutation as ReturnType<typeof vi.fn>).mock.calls;
    const lastPush = pushCalls[pushCalls.length - 1][0] as CodeMutation;
    expect(lastPush.content).toBe('their content');
  });

  it('resolves "merged" with custom content', async () => {
    const mgr = makeManager();
    await mgr.recordMutation('/res3.sol', 'base');

    const remote: RemoteSnapshot = {
      path: '/res3.sol',
      content: 'remote',
      lamport: 99,
      vectorClock: { 'other-device': 99 },
      updatedAt: Date.now(),
    };
    const adapter = makeAdapter([remote]);
    mgr.setAdapter(adapter);

    const detectedConflicts: SyncConflict[] = [];
    mgr.onConflict((c) => detectedConflicts.push(...c));
    await mgr.twoWaySync();

    await mgr.resolveConflict(detectedConflicts[0], 'merged', 'merged content');

    const pushCalls = (adapter.pushMutation as ReturnType<typeof vi.fn>).mock.calls;
    const lastPush = pushCalls[pushCalls.length - 1][0] as CodeMutation;
    expect(lastPush.content).toBe('merged content');
  });
});

// ---------------------------------------------------------------------------
// Legacy API surface (backward compat)
// ---------------------------------------------------------------------------

describe('SyncManager — legacy pending-change API', () => {
  it('tracks and resolves change IDs', () => {
    const mgr = makeManager();
    mgr.trackPendingChange('change-1');
    mgr.trackPendingChange('change-2');
    expect(mgr.getPendingChanges()).toContain('change-1');

    mgr.resolvePendingChange('change-1');
    expect(mgr.getPendingChanges()).not.toContain('change-1');
    expect(mgr.getPendingChanges()).toContain('change-2');
  });

  it('does not duplicate change IDs', () => {
    const mgr = makeManager();
    mgr.trackPendingChange('dup');
    mgr.trackPendingChange('dup');
    expect(mgr.getPendingChanges().filter((id) => id === 'dup')).toHaveLength(1);
  });
});
