'use client';

/**
 * useCollaborativeEditor
 *
 * A React hook that manages a Yjs collaborative session with:
 *
 *  1. Singleton provider – one Y.Doc + WebsocketProvider per (roomId, userId)
 *     pair; calling the hook a second time from the same component tree reuses
 *     the existing instance instead of opening a second connection.
 *
 *  2. Pending-update queue – while the provider is disconnected every local
 *     document mutation is captured and stored in a PendingUpdateQueue.
 *
 *  3. Reconnect replay – once the provider reconnects, all queued updates are
 *     replayed into the shared doc in FIFO order so no local work is lost.
 *
 *  4. Observable conflicts – the hook emits `hasConflict: true` when the
 *     shared state changed remotely while local updates were pending.
 *
 *  5. Teardown on unmount – the provider is disconnected and the Y.Doc is
 *     destroyed when the component unmounts, preventing memory leaks.
 *
 * Auth / privacy notes:
 *  - No user-identifying data beyond userId is broadcast to remote peers.
 *  - The hook never logs internal error details to the browser console
 *    when running in production; it surfaces a user-friendly message only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { PendingUpdateQueue } from '@/lib/collaboration/PendingUpdateQueue';

// ---------------------------------------------------------------------------
// Singleton registry (module-level, cleared on full page unload)
// ---------------------------------------------------------------------------

interface RegistryEntry {
  doc: Y.Doc;
  provider: WebsocketProvider;
  queue: PendingUpdateQueue;
  /** Number of active consumers that share this entry. */
  refCount: number;
}

const registry = new Map<string, RegistryEntry>();

function registryKey(roomId: string, userId: string): string {
  return `${roomId}::${userId}`;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReconnectStatus =
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

export interface CollaborativeEditorState {
  /** The shared Y.Doc (null while initialising). */
  doc: Y.Doc | null;
  /** The awareness channel for cursor / presence data. */
  awareness: WebsocketProvider['awareness'] | null;
  /** Whether the WebSocket provider is currently connected. */
  isConnected: boolean;
  /** Richer connection status. */
  reconnectStatus: ReconnectStatus;
  /** True when remote state changed while we were offline — user should review. */
  hasConflict: boolean;
  /** Number of local updates still waiting to be replayed on the next connect. */
  pendingUpdateCount: number;
  /** Manually trigger a reconnect attempt. */
  reconnect: () => void;
  /** Dismiss the conflict flag (e.g. after the user reviews the diff). */
  dismissConflict: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useCollaborativeEditor(
  roomId: string,
  userId: string
): CollaborativeEditorState {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectStatus, setReconnectStatus] = useState<ReconnectStatus>('disconnected');
  const [hasConflict, setHasConflict] = useState(false);
  const [pendingUpdateCount, setPendingUpdateCount] = useState(0);

  // Track which registry entry this mount "owns" so we can release the ref.
  const keyRef = useRef<string | null>(null);
  const entryRef = useRef<RegistryEntry | null>(null);

  // Stable snapshot of prev remote state for conflict detection.
  const prevRemoteVectorRef = useRef<Uint8Array | null>(null);

  // -----------------------------------------------------------------------
  // Initialise (or reuse) the singleton entry
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!roomId || !userId) return;

    const key = registryKey(roomId, userId);
    keyRef.current = key;

    let entry = registry.get(key);

    if (!entry) {
      const doc = new Y.Doc();

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:1234';
      const provider = new WebsocketProvider(wsUrl, `canvas-${roomId}`, doc, {
        connect: true,
      });

      const queue = new PendingUpdateQueue();

      entry = { doc, provider, queue, refCount: 0 };
      registry.set(key, entry);
    }

    entry.refCount += 1;
    entryRef.current = entry;

    const { doc, provider, queue } = entry;

    // Set up awareness presence (idempotent — later mounts overwrite the
    // local state, which is fine because userId is stable).
    provider.awareness.setLocalState({
      user: {
        id: userId,
        name: `User ${userId.slice(0, 8)}`,
        color: `hsl(${(userId.charCodeAt(0) * 47) % 360}, 65%, 55%)`,
      },
    });

    // ------------------------------------------------------------------
    // Capture local updates while disconnected
    // ------------------------------------------------------------------
    const handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
      // origin === provider means the update came from the network — ignore.
      if (origin === provider) return;

      if (!provider.wsconnected) {
        queue.enqueue(update);
        setPendingUpdateCount(queue.size);
      }
    };

    doc.on('update', handleLocalUpdate);

    // ------------------------------------------------------------------
    // React to provider status changes
    // ------------------------------------------------------------------
    const handleStatus = ({ status }: { status: string }) => {
      const connected = status === 'connected';

      setIsConnected(connected);
      setReconnectStatus(
        connected ? 'connected' : status === 'connecting' ? 'reconnecting' : 'disconnected'
      );

      if (connected && queue.size > 0) {
        // Check whether the remote state advanced while we were offline —
        // if it did that indicates a potential conflict.
        const remoteVector = Y.encodeStateVector(doc);
        if (prevRemoteVectorRef.current) {
          const prev = prevRemoteVectorRef.current;
          const different =
            prev.length !== remoteVector.length ||
            prev.some((byte, i) => byte !== remoteVector[i]);
          if (different) {
            setHasConflict(true);
          }
        }

        // Replay pending updates into the shared doc.
        const applied = queue.replayInto(doc);
        setPendingUpdateCount(0);

        if (process.env.NODE_ENV !== 'production' && applied > 0) {
          console.debug(`[useCollaborativeEditor] Replayed ${applied} pending update(s) for room "${roomId}".`);
        }
      }

      if (!connected) {
        // Snapshot the current remote state vector so we can compare later.
        prevRemoteVectorRef.current = Y.encodeStateVector(doc);
      }
    };

    provider.on('status', handleStatus);

    // Sync initial connection state (provider might already be connected when
    // the hook mounts via the singleton path).
    const alreadyConnected = (provider as unknown as { wsconnected: boolean }).wsconnected ?? false;
    if (alreadyConnected) {
      setIsConnected(true);
      setReconnectStatus('connected');
    }

    // ------------------------------------------------------------------
    // Teardown
    // ------------------------------------------------------------------
    return () => {
      doc.off('update', handleLocalUpdate);
      provider.off('status', handleStatus);

      const current = registry.get(key);
      if (!current) return;

      current.refCount -= 1;

      if (current.refCount <= 0) {
        // Last consumer — fully tear down.
        try {
          provider.awareness.setLocalState(null);
          provider.disconnect();
          provider.destroy();
          doc.destroy();
        } catch {
          // Ignore errors during cleanup.
        }
        registry.delete(key);
      }

      keyRef.current = null;
      entryRef.current = null;
    };
    // roomId and userId are the stable identity for this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  // -----------------------------------------------------------------------
  // Stable callbacks
  // -----------------------------------------------------------------------
  const reconnect = useCallback(() => {
    const entry = entryRef.current;
    if (!entry) return;
    setReconnectStatus('reconnecting');
    try {
      entry.provider.connect();
    } catch {
      setReconnectStatus('disconnected');
    }
  }, []);

  const dismissConflict = useCallback(() => {
    setHasConflict(false);
  }, []);

  // -----------------------------------------------------------------------
  // Derive values from the current registry entry
  // -----------------------------------------------------------------------
  const entry = entryRef.current;

  return {
    doc: entry?.doc ?? null,
    awareness: entry?.provider.awareness ?? null,
    isConnected,
    reconnectStatus,
    hasConflict,
    pendingUpdateCount,
    reconnect,
    dismissConflict,
  };
}

// ---------------------------------------------------------------------------
// Exported for testing only
// ---------------------------------------------------------------------------
export { registry as _providerRegistry };
