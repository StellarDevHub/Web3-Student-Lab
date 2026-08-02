import { useCallback, useEffect, useRef, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string };
  style?: Record<string, string | number>;
  width?: number;
  height?: number;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  markerEnd?: { type: string };
  animated?: boolean;
}

interface CollaborationState {
  doc: Y.Doc | null;
  awareness: any;
  isConnected: boolean;
}

// Memory leak prevention utilities
class YjsMemoryManager {
  private static instances = new Map<
    string,
    { doc: Y.Doc; provider: WebsocketProvider; lastAccess: number }
  >();
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static readonly MAX_INACTIVE_TIME = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_INSTANCES = 10;

  static getInstance(
    roomId: string,
    userId: string
  ): { doc: Y.Doc; provider: WebsocketProvider } | null {
    const key = `${roomId}-${userId}`;
    const existing = this.instances.get(key);

    if (existing) {
      existing.lastAccess = Date.now();
      return { doc: existing.doc, provider: existing.provider };
    }

    return null;
  }

  static setInstance(
    roomId: string,
    userId: string,
    doc: Y.Doc,
    provider: WebsocketProvider
  ): void {
    const key = `${roomId}-${userId}`;

    // Clean up old instances if we have too many
    if (this.instances.size >= this.MAX_INSTANCES) {
      this.cleanupOldestInstance();
    }

    this.instances.set(key, {
      doc,
      provider,
      lastAccess: Date.now(),
    });

    // Start cleanup interval if not already running
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupInactiveInstances();
      }, 60000); // Check every minute
    }
  }

  static removeInstance(roomId: string, userId: string): void {
    const key = `${roomId}-${userId}`;
    const instance = this.instances.get(key);

    if (instance) {
      try {
        // Properly clean up Yjs resources
        instance.provider.destroy();
        instance.doc.destroy();
      } catch (error) {
        console.warn('Error during Yjs cleanup:', error);
      }

      this.instances.delete(key);
    }

    // Stop cleanup interval if no instances left
    if (this.instances.size === 0 && this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  static cleanupInactiveInstances(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.instances.forEach((instance, key) => {
      if (now - instance.lastAccess > this.MAX_INACTIVE_TIME) {
        toDelete.push(key);
      }
    });

    toDelete.forEach((key) => {
      const [roomId, userId] = key.split('-');
      this.removeInstance(roomId, userId);
    });

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} inactive Yjs instances`);
    }
  }

  static cleanupOldestInstance(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    this.instances.forEach((instance, key) => {
      if (instance.lastAccess < oldestTime) {
        oldestTime = instance.lastAccess;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      const [roomId, userId] = oldestKey.split('-');
      this.removeInstance(roomId, userId);
    }
  }

  static getStats(): { instanceCount: number; memoryUsage?: number } {
    const instanceCount = this.instances.size;
    let memoryUsage: number | undefined;

    if ('memory' in performance) {
      memoryUsage = (performance as any).memory.usedJSHeapSize;
    }

    return { instanceCount, memoryUsage };
  }

  static forceCleanup(): void {
    const keys = Array.from(this.instances.keys());
    keys.forEach((key) => {
      const [roomId, userId] = key.split('-');
      this.removeInstance(roomId, userId);
    });

    console.log(`Force cleaned up ${keys.length} Yjs instances`);
  }
}

export function useCanvasCollaborationFixed(roomId: string, userId: string) {
  const [state, setState] = useState<CollaborationState>({
    doc: null,
    awareness: null,
    isConnected: false,
  });

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const observersRef = useRef<Array<() => void>>([]);

  const cleanup = useCallback(() => {
    // Clean up all observers
    observersRef.current.forEach((cleanupFn) => {
      try {
        cleanupFn();
      } catch (error) {
        console.warn('Error cleaning up observer:', error);
      }
    });
    observersRef.current = [];

    // Clean up provider and doc
    if (providerRef.current) {
      try {
        providerRef.current.disconnect();
        providerRef.current.destroy();
      } catch (error) {
        console.warn('Error destroying provider:', error);
      }
      providerRef.current = null;
    }

    if (docRef.current) {
      try {
        docRef.current.destroy();
      } catch (error) {
        console.warn('Error destroying doc:', error);
      }
      docRef.current = null;
    }

    // Remove from memory manager
    YjsMemoryManager.removeInstance(roomId, userId);

    setState({ doc: null, awareness: null, isConnected: false });
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;

    // Check if we already have an instance
    const existing = YjsMemoryManager.getInstance(roomId, userId);
    if (existing) {
      docRef.current = existing.doc;
      providerRef.current = existing.provider;

      const awareness = existing.provider.awareness;

      existing.provider.on('status', ({ status }) => {
        setState((prev) => ({ ...prev, isConnected: status === 'connected' }));
      });

      setState({
        doc: existing.doc,
        awareness,
        isConnected: existing.provider.wsconnected || false,
      });

      return cleanup;
    }

    // Create new instance
    const doc = new Y.Doc();
    docRef.current = doc;

    // Initialize arrays
    doc.getArray('nodes');
    doc.getArray('edges');

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
    const provider = new WebsocketProvider(wsUrl, `canvas-${roomId}`, doc, {
      connect: true,
    });

    providerRef.current = provider;

    // Store in memory manager
    YjsMemoryManager.setInstance(roomId, userId, doc, provider);

    const awareness = provider.awareness;
    awareness.setLocalState({
      user: {
        id: userId,
        name: `User ${userId.slice(0, 8)}`,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      },
    });

    // Set up event listeners with proper cleanup
    const statusHandler = ({ status }: { status: string }) => {
      setState((prev) => ({ ...prev, isConnected: status === 'connected' }));
    };

    provider.on('status', statusHandler);
    observersRef.current.push(() => provider.off('status', statusHandler));

    // Connection error handling
    const errorHandler = (error: any) => {
      console.error('WebSocket provider error:', error);
      setState((prev) => ({ ...prev, isConnected: false }));
    };

    provider.on('connection-error', errorHandler);
    observersRef.current.push(() => provider.off('connection-error', errorHandler));

    // Sync state
    setState({
      doc,
      awareness,
      isConnected: (provider as any).wsconnected || false,
    });

    return cleanup;
  }, [roomId, userId, cleanup]);

  return state;
}

function getArray<T = any>(doc: Y.Doc | null, key: string): Y.Array<T> | null {
  if (!doc) return null;
  return doc.getArray<T>(key);
}

function replaceItem<T extends { id: string }>(
  yArray: Y.Array<T>,
  id: string,
  updates: Partial<T>
): void {
  const items = yArray.toArray();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;
  const item = items[index];
  yArray.delete(index, 1);
  yArray.insert(index, [{ ...item, ...updates }]);
}

function removeItem<T extends { id: string }>(yArray: Y.Array<T>, id: string): void {
  const items = yArray.toArray();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;
  yArray.delete(index, 1);
}

export function useSharedCanvasFixed(doc: Y.Doc | null) {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);

  const nodesRef = useRef<Y.Array<CanvasNode> | null>(null);
  const edgesRef = useRef<Y.Array<CanvasEdge> | null>(null);
  const observersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!doc) return;

    const yNodes = getArray<CanvasNode>(doc, 'nodes');
    const yEdges = getArray<CanvasEdge>(doc, 'edges');

    if (!yNodes || !yEdges) return;

    nodesRef.current = yNodes;
    edgesRef.current = yEdges;

    const syncNodes = () => setNodes(yNodes.toArray());
    const syncEdges = () => setEdges(yEdges.toArray());

    syncNodes();
    syncEdges();

    // Add observers with proper cleanup
    yNodes.observe(syncNodes);
    yEdges.observe(syncEdges);

    observersRef.current.push(() => yNodes.unobserve(syncNodes));
    observersRef.current.push(() => yEdges.unobserve(syncEdges));

    return () => {
      // Clean up observers
      observersRef.current.forEach((cleanupFn) => {
        try {
          cleanupFn();
        } catch (error) {
          console.warn('Error cleaning up array observer:', error);
        }
      });
      observersRef.current = [];
    };
  }, [doc]);

  const addNode = useCallback((node: CanvasNode) => {
    if (!nodesRef.current) return;
    nodesRef.current.push([node]);
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<CanvasNode>) => {
    if (!nodesRef.current) return;
    replaceItem(nodesRef.current, id, updates as CanvasNode);
  }, []);

  const deleteNode = useCallback((id: string) => {
    if (!nodesRef.current) return;
    removeItem(nodesRef.current, id);
  }, []);

  const addEdge = useCallback((edge: CanvasEdge) => {
    if (!edgesRef.current) return;
    edgesRef.current.push([edge]);
  }, []);

  const deleteEdge = useCallback((id: string) => {
    if (!edgesRef.current) return;
    removeItem(edgesRef.current, id);
  }, []);

  return {
    nodes,
    edges,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    deleteEdge,
  };
}

export function useAwarenessFixed(awareness: any) {
  const [remoteUsers, setRemoteUsers] = useState<any[]>([]);
  const observerRef = useRef<((events: any) => void) | null>(null);

  useEffect(() => {
    if (!awareness) return;

    const updatePresence = () => {
      const states = awareness.getStates();
      const currentUsers: any[] = [];
      states.forEach((state: any, clientId: number) => {
        if (state.user && clientId !== awareness.clientID) {
          currentUsers.push({
            clientId,
            ...state.user,
          });
        }
      });
      setRemoteUsers(currentUsers);
    };

    const changeHandler = () => {
      updatePresence();
    };

    awareness.on('change', changeHandler);
    observerRef.current = changeHandler;
    updatePresence();

    return () => {
      if (observerRef.current) {
        awareness.off('change', observerRef.current);
        observerRef.current = null;
      }
    };
  }, [awareness]);

  return remoteUsers;
}

// Export memory manager for external monitoring
export { YjsMemoryManager };
