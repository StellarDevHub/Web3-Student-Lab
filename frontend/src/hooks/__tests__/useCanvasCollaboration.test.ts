import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { useCanvasCollaboration, useSharedCanvas, useAwareness } from '../useCanvasCollaboration';

vi.mock('y-websocket', () => {
  class MockWebsocketProvider {
    doc: any;
    roomName: string;
    wsUrl: string;
    options: any;
    awareness = {
      setLocalState: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getStates: vi.fn().mockReturnValue(new Map()),
      clientID: 1,
    };
    on = vi.fn((event: string, cb: any) => {
      if (event === 'status') {
        setTimeout(() => cb({ status: 'connected' }), 10);
      }
    });
    disconnect = vi.fn();
    constructor(wsUrl: string, roomName: string, doc: any, options?: any) {
      this.wsUrl = wsUrl;
      this.roomName = roomName;
      this.doc = doc;
      this.options = options;
    }
  }
  return {
    WebsocketProvider: MockWebsocketProvider,
  };
});

describe('useCanvasCollaboration hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useCanvasCollaboration', () => {
    it('initializes connection and doc', async () => {
      const { result } = renderHook(() => useCanvasCollaboration('room-1', 'user-1'));
      
      expect(result.current.doc).toBeInstanceOf(Y.Doc);
      expect(result.current.awareness).toBeDefined();
      
      // Initially disconnected
      expect(result.current.isConnected).toBe(false);

      // Wait for mock status event
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('useSharedCanvas', () => {
    it('manages nodes and edges', () => {
      const doc = new Y.Doc();
      const nodesArray = doc.getArray('nodes');
      const edgesArray = doc.getArray('edges');
      
      const { result } = renderHook(() => useSharedCanvas(doc));
      
      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);

      act(() => {
        result.current.addNode({
          id: 'n1',
          type: 'wallet',
          position: { x: 0, y: 0 },
          data: { label: 'Wallet' }
        });
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('n1');
      expect(nodesArray.length).toBe(1);

      act(() => {
        result.current.updateNode('n1', { position: { x: 10, y: 10 } });
      });

      expect(result.current.nodes[0].position).toEqual({ x: 10, y: 10 });

      act(() => {
        result.current.addEdge({ id: 'e1', source: 'n1', target: 'n2' });
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0].id).toBe('e1');

      act(() => {
        result.current.deleteNode('n1');
        result.current.deleteEdge('e1');
      });

      expect(result.current.nodes).toHaveLength(0);
      expect(result.current.edges).toHaveLength(0);
    });
  });

  describe('useAwareness', () => {
    it('tracks remote users', () => {
      const mockAwareness = {
        getStates: vi.fn().mockReturnValue(new Map([
          [1, { user: { id: 'u1', name: 'User 1' } }],
          [2, { user: { id: 'u2', name: 'User 2' } }]
        ])),
        on: vi.fn(),
        off: vi.fn(),
        clientID: 1, // local client is 1
      };

      const { result } = renderHook(() => useAwareness(mockAwareness));

      // Should only include client 2 (remote user)
      expect(result.current).toHaveLength(1);
      expect(result.current[0].clientId).toBe(2);
      expect(result.current[0].id).toBe('u2');
    });
  });
});
