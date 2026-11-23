'use client';

/**
 * Offline engine indicator + alert banner (FE-HARD-34).
 *
 * Covers all three sub-tasks in one place:
 * - [Easy] `navigator.onLine` event listener via `useOnlineStatus()`.
 * - [Medium] Offline alert banner (`role="alert"`) with pending-action count.
 * - [Advanced] On reconnection the engine flushes the IndexedDB action queue
 *   and registers the Background Sync tag (`public/sw.js` replays via
 *   `FLUSH_QUEUE` even when the `online` event was missed), so lesson progress
 *   and code written offline sync seamlessly.
 *
 * All props are optional: when omitted the component drives itself from the
 * engine. Existing callers (e.g. the playground) may keep passing explicit
 * values, which take precedence over the engine.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushOfflineSyncQueue, getPendingSyncCount } from '@/lib/offline-sync';
import { requestBackgroundSync } from '@/lib/service-worker-sync';

export type OfflineSyncState = 'idle' | 'syncing' | 'offline' | 'error';

/** [Easy] Reactive `navigator.onLine` with online/offline event listeners. */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Reconcile in case events were missed while mounted elsewhere.
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

interface OfflineIndicatorProps {
  isOnline?: boolean;
  syncState?: OfflineSyncState;
  pendingCount?: number;
  onManualSync?: () => void;
}

export function OfflineIndicator({
  isOnline: isOnlineProp,
  syncState: syncStateProp,
  pendingCount: pendingCountProp,
  onManualSync: onManualSyncProp,
}: OfflineIndicatorProps) {
  const engineOnline = useOnlineStatus();
  const isOnline = isOnlineProp ?? engineOnline;

  const [engineSyncState, setEngineSyncState] = useState<OfflineSyncState>('idle');
  const [enginePendingCount, setEnginePendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingSyncCount();
      if (mountedRef.current) setEnginePendingCount(count);
    } catch {
      // Pending count is advisory; a queue read failure must not break UI.
    }
  }, []);

  const runSync = useCallback(async () => {
    if (!navigator.onLine) {
      setEngineSyncState('offline');
      return;
    }
    setEngineSyncState('syncing');
    try {
      await flushOfflineSyncQueue();
      // Register the Background Sync safety net as well: if this flush raced
      // a connection drop, the worker retries on restoration.
      await requestBackgroundSync().catch(() => false);
      if (!mountedRef.current) return;
      setEngineSyncState('idle');
      setLastSyncedAt(new Date().toISOString());
      await refreshPendingCount();
    } catch {
      if (mountedRef.current) setEngineSyncState('error');
    }
  }, [refreshPendingCount]);

  // Initial count on mount.
  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  // [Advanced] Seamless sync upon reconnection: flush the queued actions and
  // arm Background Sync; drop to the offline state when disconnected.
  const wasOnlineRef = useRef(engineOnline);
  useEffect(() => {
    if (isOnlineProp !== undefined) return; // externally driven — engine stays out.
    if (engineOnline && !wasOnlineRef.current) {
      void runSync();
    } else if (!engineOnline) {
      setEngineSyncState('offline');
      void refreshPendingCount();
    }
    wasOnlineRef.current = engineOnline;
  }, [engineOnline, isOnlineProp, runSync, refreshPendingCount]);

  const syncState = syncStateProp ?? engineSyncState;
  const pendingCount = pendingCountProp ?? enginePendingCount;
  const handleManualSync = useCallback(() => {
    if (onManualSyncProp) {
      onManualSyncProp();
      return;
    }
    void runSync();
  }, [onManualSyncProp, runSync]);

  const toneClass = !isOnline
    ? 'text-amber-400 border-amber-400/30'
    : syncState === 'error'
      ? 'text-red-400 border-red-400/30'
      : syncState === 'syncing'
        ? 'text-blue-400 border-blue-400/30'
        : 'text-green-400 border-green-400/30';

  return (
    <div className="space-y-2">
      {/* [Medium] Offline alert banner — students keep reading lessons and
          writing code; queued progress is counted, not lost. */}
      {!isOnline && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[10px] font-black tracking-wider text-amber-300 uppercase"
        >
          <span aria-hidden="true">●</span>
          <span className="flex-1">
            Offline mode — keep learning. {pendingCount} action
            {pendingCount === 1 ? '' : 's'} queued and will sync on reconnect.
          </span>
          <button
            type="button"
            onClick={handleManualSync}
            className="rounded border border-amber-400/40 px-2 py-1 text-[9px] text-amber-200 hover:bg-amber-500/20"
          >
            Retry
          </button>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[10px] font-black tracking-wider uppercase ${toneClass}`}
      >
        <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
        <span>Sync: {syncState}</span>
        <span>Pending: {pendingCount}</span>
        {lastSyncedAt && isOnline && syncStateProp === undefined && (
          <span className="normal-case opacity-70">
            · synced {new Date(lastSyncedAt).toLocaleTimeString()}
          </span>
        )}
        <button
          type="button"
          onClick={handleManualSync}
          className="rounded border border-white/20 px-2 py-1 text-[9px] text-white hover:bg-white/10"
        >
          Sync now
        </button>
      </div>
    </div>
  );
}

export default OfflineIndicator;
