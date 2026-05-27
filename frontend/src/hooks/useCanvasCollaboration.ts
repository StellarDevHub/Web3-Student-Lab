import { useEffect, useRef, useState } from 'react';
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

export function useCanvasCollaboration(roomId: string, userId: string) {
  const [state, setState] = useState<CollaborationState>({
    doc: null,
    awareness: null,
    isConnected: false,
  });

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    const doc = new Y.Doc();
    docRef.current = doc;

    doc.getArray('nodes');
    doc.getArray('edges');

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
    const provider = new WebsocketProvider(wsUrl, `canvas-${roomId}`, doc, {
      connect: true,
      awareness: true,
    });

    providerRef.current = provider;

    const awareness = provider.awareness;
    awareness.setLocalState({
      user: {
        id: userId,
        name: `User ${userId.slice(0, 8)}`,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      },
    });

    provider.on('status', ({ status }) => {
      setState((prev) => ({ ...prev, isConnected: status === 'connected' }));
    });

    setState({
      doc,
      awareness,
      isConnected: false,
    });

    return () => {
      provider.disconnect();
      doc.destroy();
    };
  }, [roomId, userId]);

  return state;
}

function getArray<T = any>(doc: Y.Doc | null, key: string) {
  if (!doc) return null;
  return doc.getArray<T>(key);
}

function replaceItem<T extends { id: string }>(
  yArray: Y.Array<T>,
  id: string,
  updates: Partial<T>
) {
  const items = yArray.toArray();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;
  const item = items[index];
  yArray.delete(index, 1);
  yArray.insert(index, [{ ...item, ...updates }]);
}

function removeItem<T extends { id: string }>(yArray: Y.Array<T>, id: string) {
  const items = yArray.toArray();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;
  yArray.delete(index, 1);
}

export function useSharedCanvas(doc: Y.Doc | null) {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);

  const nodesRef = useRef<Y.Array<CanvasNode> | null>(null);
  const edgesRef = useRef<Y.Array<CanvasEdge> | null>(null);

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

    yNodes.observe(syncNodes);
    yEdges.observe(syncEdges);

    return () => {
      yNodes.unobserve(syncNodes);
      yEdges.unobserve(syncEdges);
    };
  }, [doc]);

  const addNode = (node: CanvasNode) => {
    if (!nodesRef.current) return;
    nodesRef.current.push([node]);
  };

  const updateNode = (id: string, updates: Partial<CanvasNode>) => {
    if (!nodesRef.current) return;
    replaceItem(nodesRef.current, id, updates as CanvasNode);
  };

  const deleteNode = (id: string) => {
    if (!nodesRef.current) return;
    removeItem(nodesRef.current, id);
  };

  const addEdge = (edge: CanvasEdge) => {
    if (!edgesRef.current) return;
    edgesRef.current.push([edge]);
  };

  const deleteEdge = (id: string) => {
    if (!edgesRef.current) return;
    removeItem(edgesRef.current, id);
  };

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

export function useAwareness(awareness: any) {
  const [remoteUsers, setRemoteUsers] = useState<any[]>([]);

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

    awareness.on('change', updatePresence);
    updatePresence();

    return () => {
      awareness.off('change', updatePresence);
    };
  }, [awareness]);

  return remoteUsers;
}
