'use client';

/**
 * useOfflineSync — FE-070
 *
 * React hook that:
 *  1. Tracks online/offline network state reactively.
 *  2. Records code-editor mutations to IndexedDB via SyncManager.
 *  3. Triggers two-way sync automatically when the connection restores
 *     (both via the `online` DOM event and the Background Sync API wake-up).
 *  4. Surfaces detected conflicts through the returned `conflicts` array so
 *     the UI can open the interactive diff modal.
 *  5. Provides `resolveConflict` for modal submissions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSyncManager,
  type CodeMutation,
  type SyncConflict,
  type SyncState,
} from '@/lib/storage/SyncManager';
import { requestBackgroundSync } from '@/lib/service-worker-sync';

export interface UseOfflineSyncOptions {
  /**
   * Optionally pass a backend adapter to enable two-way sync.
   * When omitted the hook only persists mutations locally.
   */
  adapter?: Parameters<ReturnType<typeof getSyncManager>['setAdapter']>[0];
  /**
   * Called after every successful sync cycle (conflicts resolved or none
   * found).
   */
  onSyncComplete?: () => void;
  /**
   * Called when any sync error occurs.
   */
  onSyncError?: (err: unknown) => void;
}

export interface UseOfflineSyncReturn {
  /** Whether the browser currently has network access. */
  isOnline: boolean;
  /** Current sync state from SyncManager. */
  syncState: SyncState;
  /** Unresolved conflicts awaiting user decision. */
  conflicts: SyncConflict[];
  /** Number of mutations still pending a successful sync. */
  pendingCount: number;
  /**
   * Record a code-editor mutation.  Safe to call while offline — the
   * mutation is persisted locally and replayed on reconnect.
   */
  recordMutation: (path: string, content: string) => Promise<CodeMutation>;
  /**
   * Manually trigger a sync cycle (e.g. after a "Retry" button press).
   */
  triggerSync: () => Promise<void>;
  /**
   * Resolve a pending conflict and push the winning content to the server.
   */
  resolveConflict: (
    conflict: SyncConflict,
    resolution: 'mine' | 'theirs' | 'merged',
    mergedContent?: string,
  ) => Promise<void>;
  /**
   * Dismiss a conflict without resolving it (keeps the pending mutation for
   * the next sync attempt).
   */
  dismissConflict: (conflict: SyncConflict) => void;
}

export function useOfflineSync(options: UseOfflineSyncOptions = {}): UseOfflineSyncReturn {
  const { adapter, onSyncComplete, onSyncError } = options;

  const manager = useRef(getSyncManager());

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // -------------------------------------------------------------------------
  // Attach adapter once
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (adapter) {
      manager.current.setAdapter(adapter);
    }
  }, [adapter]);

  // -------------------------------------------------------------------------
  // Subscribe to SyncManager state
  // -------------------------------------------------------------------------
  useEffect(() => {
    const unsubState = manager.current.subscribe(setSyncState);
    const unsubConflict = manager.current.onConflict((incoming) => {
      setConflicts((prev) => {
        // Merge new conflicts, avoiding exact duplicates by path.
        const existingPaths = new Set(prev.map((c) => c.path));
        const novel = incoming.filter((c) => !existingPaths.has(c.path));
        return [...prev, ...novel];
      });
    });
    return () => {
      unsubState();
      unsubConflict();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Refresh pending count whenever sync state changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    manager.current.getPendingMutations().then((pending) => {
      if (!cancelled) setPendingCount(pending.length);
    });
    return () => { cancelled = true; };
  }, [syncState]);

  // -------------------------------------------------------------------------
  // Core sync function
  // -------------------------------------------------------------------------
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const ok = await manager.current.twoWaySync();
      if (ok) {
        onSyncComplete?.();
      }
    } catch (err) {
      onSyncError?.(err);
    }
    // Refresh pending count after sync attempt.
    const pending = await manager.current.getPendingMutations();
    setPendingCount(pending.length);
  }, [onSyncComplete, onSyncError]);

  // -------------------------------------------------------------------------
  // Network event listeners
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // Background Sync wake-up: service worker posts FLUSH_QUEUE when it
    // regains connectivity even if the `online` event was missed.
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_QUEUE') {
        triggerSync();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleWorkerMessage);

    // If we're already online at mount time and have pending work, sync now.
    if (navigator.onLine) {
      manager.current.getPendingMutations().then((pending) => {
        if (pending.length > 0) triggerSync();
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleWorkerMessage);
    };
  }, [triggerSync]);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const recordMutation = useCallback(
    async (path: string, content: string): Promise<CodeMutation> => {
      const mutation = await manager.current.recordMutation(path, content);
      setPendingCount((prev) => prev + 1);
      // Register background sync tag so the SW replays on restoration.
      Promise.resolve(requestBackgroundSync()).catch(() => undefined);
      return mutation;
    },
    [],
  );

  const resolveConflict = useCallback(
    async (
      conflict: SyncConflict,
      resolution: 'mine' | 'theirs' | 'merged',
      mergedContent?: string,
    ) => {
      await manager.current.resolveConflict(conflict, resolution, mergedContent);
      setConflicts((prev) => prev.filter((c) => c.path !== conflict.path));
      const pending = await manager.current.getPendingMutations();
      setPendingCount(pending.length);
    },
    [],
  );

  const dismissConflict = useCallback((conflict: SyncConflict) => {
    setConflicts((prev) => prev.filter((c) => c.path !== conflict.path));
  }, []);

  return {
    isOnline,
    syncState,
    conflicts,
    pendingCount,
    recordMutation,
    triggerSync,
    resolveConflict,
    dismissConflict,
  };
}
