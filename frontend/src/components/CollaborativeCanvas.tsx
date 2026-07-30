'use client';

import { useCollaborativeEditor } from '@/hooks/useCollaborativeEditor';
import { useAwareness, useSharedCanvas } from '@/hooks/useCanvasCollaboration';
import { ReconnectBanner } from '@/components/collaboration/ReconnectBanner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Connection,
  Controls,
  EdgeChange,
  MarkerType,
  MiniMap,
  NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nodeTypes } from './whiteboard/Web3Nodes';

interface CollaborativeCanvasProps {
  roomId: string;
  userId: string;
  onCanvasReady?: () => void;
}

export function CollaborativeCanvas({ roomId, userId, onCanvasReady }: CollaborativeCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showConflictResolver, setShowConflictResolver] = useState(false);

  // Use the safe reconnect hook instead of the plain useCanvasCollaboration.
  const {
    doc,
    awareness,
    isConnected,
    reconnectStatus,
    hasConflict,
    pendingUpdateCount,
    reconnect,
    dismissConflict,
  } = useCollaborativeEditor(roomId, userId);

  const {
    nodes,
    edges,
    addNode,
    updateNode,
    deleteNode,
    addEdge: addCanvasEdge,
    deleteEdge,
  } = useSharedCanvas(doc);

  const remoteUsers = useAwareness(awareness);

  useEffect(() => {
    if (isConnected && onCanvasReady) {
      onCanvasReady();
    }
  }, [isConnected, onCanvasReady]);

  const defaultNodes = useMemo(() => nodes, [nodes]);
  const defaultEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        markerEnd: edge.markerEnd ? { type: edge.markerEnd.type as any } : undefined,
      })) as any[],
    [edges]
  );

  const handleExportImage = async () => {
    if (!canvasRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `canvas-${roomId}-${Date.now()}.png`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!canvasRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      let ratio = pageWidth / canvasWidth;
      if (canvasHeight * ratio > pageHeight) {
        ratio = pageHeight / canvasHeight;
      }

      const width = canvasWidth * ratio;
      const height = canvasHeight * ratio;
      const x = (pageWidth - width) / 2;
      const y = (pageHeight - height) / 2;

      pdf.addImage(imgData, 'PNG', x, y, width, height);
      pdf.save(`canvas-${roomId}-${Date.now()}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddStickyNote = () => {
    addNode({
      id: `node-${Date.now()}`,
      type: 'default',
      position: {
        x: 120 + Math.random() * 240,
        y: 120 + Math.random() * 180,
      },
      data: {
        label: 'Sticky Note',
      },
      style: {
        background: '#fef3c7',
        color: '#92400e',
        border: '2px solid #f59e0b',
        borderRadius: 16,
        padding: 16,
        width: 220,
      },
    });
  };

  const handleAddShape = (shape: 'rectangle' | 'circle') => {
    addNode({
      id: `node-${Date.now()}`,
      type: 'default',
      position: {
        x: 100 + Math.random() * 260,
        y: 100 + Math.random() * 260,
      },
      data: {
        label: shape === 'rectangle' ? 'Rectangle' : 'Circle',
      },
      style: {
        background: shape === 'rectangle' ? '#dbeafe' : '#d1fae5',
        color: '#0f172a',
        border: '2px solid #3b82f6',
        borderRadius: shape === 'circle' ? '50%' : 12,
        padding: 18,
        width: 180,
        height: 180,
      },
    });
  };

  const handleAddWeb3Node = (type: 'wallet' | 'contract' | 'actor') => {
    addNode({
      id: `node-${Date.now()}`,
      type: type,
      position: {
        x: 150 + Math.random() * 200,
        y: 150 + Math.random() * 200,
      },
      data: {
        label: type.charAt(0).toUpperCase() + type.slice(1),
        ...(type === 'wallet' ? { address: '0x1234...abcd' } : {}),
        ...(type === 'contract' ? { network: 'Ethereum' } : {}),
      },
    });
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          updateNode(change.id, { position: change.position });
        }
        if (change.type === 'remove') {
          deleteNode(change.id);
        }
      });
    },
    [updateNode, deleteNode]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      changes.forEach((change) => {
        if (change.type === 'remove') {
          deleteEdge(change.id);
        }
      });
    },
    [deleteEdge]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      addCanvasEdge({
        id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        animated: true,
      });
    },
    [addCanvasEdge]
  );

  return (
    <div className="flex h-full flex-col">
      {/* ----------------------------------------------------------------- */}
      {/* Reconnect / conflict banner (zero-height when not needed)          */}
      {/* ----------------------------------------------------------------- */}
      <ReconnectBanner
        status={reconnectStatus}
        pendingUpdateCount={pendingUpdateCount}
        hasConflict={hasConflict}
        onReconnect={reconnect}
        onReviewConflict={() => setShowConflictResolver(true)}
        onDismissConflict={dismissConflict}
      />

      {/* ----------------------------------------------------------------- */}
      {/* Toolbar                                                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-6 py-4 md:flex-row md:items-center md:justify-between dark:border-gray-700 dark:bg-gray-900">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Canvas: {roomId}
            </h1>
            <span
              className={`h-3 w-3 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}
              aria-label={isConnected ? 'Connected' : 'Disconnected'}
              title={isConnected ? 'Connected' : reconnectStatus === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'}
            />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Drag nodes to arrange ideas. Connect them with arrows to document flow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAddStickyNote}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            Add Sticky Note
          </button>
          <button
            onClick={() => handleAddShape('rectangle')}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            Add Rectangle
          </button>
          <button
            onClick={() => handleAddShape('circle')}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            Add Circle
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={() => handleAddWeb3Node('wallet')}
            className="rounded-md bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-400"
          >
            Add Wallet
          </button>
          <button
            onClick={() => handleAddWeb3Node('contract')}
            className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400"
          >
            Add Contract
          </button>
          <button
            onClick={() => handleAddWeb3Node('actor')}
            className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-400"
          >
            Add Actor
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={handleExportImage}
            disabled={isExporting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export PNG'}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Collaborator presence bar                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        <span>
          {remoteUsers.length > 0
            ? `${remoteUsers.length} collaborator${remoteUsers.length > 1 ? 's' : ''} active`
            : 'No active collaborators yet'}
        </span>
        <div className="flex items-center gap-2">
          {remoteUsers.map((user) => (
            <span
              key={user.clientId}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: user.color }}
              title={user.name}
              aria-label={`Collaborator: ${user.name}`}
            >
              {user.name.charAt(0)}
            </span>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Canvas                                                              */}
      {/* ----------------------------------------------------------------- */}
      <div ref={canvasRef} className="relative flex-1 overflow-hidden bg-slate-950">
        {doc ? (
          <ReactFlow
            nodes={defaultNodes}
            edges={defaultEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            attributionPosition="bottom-left"
            className="h-full"
          >
            <MiniMap nodeStrokeColor="#888" nodeColor="#888" />
            <Controls />
            <Background color="#888" gap={16} size={1} />
          </ReactFlow>
        ) : (
          <div className="flex h-full items-center justify-center px-6 py-12 text-center text-white">
            <div>
              <p className="text-xl font-semibold">Loading real-time canvas...</p>
              <p className="mt-2 text-sm text-slate-300">
                Waiting for the collaboration server to connect.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Conflict resolver modal (lazy – only rendered when triggered)      */}
      {/* ----------------------------------------------------------------- */}
      {showConflictResolver && doc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Conflict review"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Review Remote Changes</h2>
              <button
                type="button"
                aria-label="Close conflict review"
                onClick={() => {
                  setShowConflictResolver(false);
                  dismissConflict();
                }}
                className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              The shared canvas was updated while you were disconnected. Your pending edits have
              been merged automatically using Yjs CRDT.  If anything looks wrong, you can undo
              recent changes from the canvas toolbar.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConflictResolver(false);
                  dismissConflict();
                }}
                className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-600"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
