'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import {
  useCanvasCollaboration,
  useSharedCanvas,
  useAwareness,
} from '@/hooks/useCanvasCollaboration';
import { SyncManager } from '@/lib/whiteboard/SyncManager';
import type { CompactShapePayload, Point2D } from '@/lib/whiteboard/BinaryCodec';
import {
  serializeShapesToJSON,
  serializeShapesToSVG,
} from '@/lib/whiteboard/CanvasManager';

interface CollaborativeCanvasProps {
  roomId: string;
  userId: string;
}

export function CollaborativeCanvas({ roomId, userId }: CollaborativeCanvasProps) {
  const { doc, awareness, isConnected } = useCanvasCollaboration(roomId, userId);
  const { nodes, addNode } = useSharedCanvas(doc);
  const remoteUsers = useAwareness(awareness);

  const canvasRef = useRef<HTMLDivElement>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);
  const [binaryShapes, setBinaryShapes] = useState<CompactShapePayload[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [activePath, setActivePath] = useState<Point2D[] | null>(null);

  useEffect(() => {
    if (!doc || typeof doc.getMap !== 'function') return;
    const manager = new SyncManager(doc, null, awareness);
    syncManagerRef.current = manager;
    manager.syncWithYjs({
      onShapesChanged: (shapes) => setBinaryShapes(shapes),
    });
    setBinaryShapes(manager.getAllShapes());

    return () => {
      manager.destroy();
      syncManagerRef.current = null;
    };
  }, [doc, awareness]);

  const collaboratorCount = remoteUsers.length;

  const allExportableShapes = useMemo<CompactShapePayload[]>(() => {
    const nodeShapes: CompactShapePayload[] = nodes.map((n) => ({
      id: n.id,
      kind:
        n.type === 'wallet' || n.type === 'contract' || n.type === 'actor'
          ? n.type
          : 'default',
      x: n.position.x,
      y: n.position.y,
      w: n.width ?? 160,
      h: n.height ?? 60,
      text: n.data.label,
    }));
    return [...nodeShapes, ...binaryShapes];
  }, [nodes, binaryShapes]);

  const handleAddRectangle = () => {
    const x = Math.random() * 400;
    const y = Math.random() * 300;
    const id = `rect-${Date.now()}`;
    addNode({
      id,
      type: 'default',
      position: { x, y },
      data: { label: 'Rectangle' },
    });
    syncManagerRef.current?.upsertShape({
      id,
      kind: 'geo',
      geo: 'rectangle',
      x,
      y,
      w: 160,
      h: 80,
      text: 'Rectangle',
    });
  };

  const handleAddStickyNote = () => {
    const id = `sticky-${Date.now()}`;
    syncManagerRef.current?.upsertShape({
      id,
      kind: 'sticky',
      x: 120 + Math.random() * 280,
      y: 100 + Math.random() * 200,
      w: 180,
      h: 120,
      color: 'yellow',
      text: 'Sticky Note',
    });
  };

  const handleAddWallet = () => {
    addNode({
      id: `wallet-${Date.now()}`,
      type: 'wallet',
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: 'Wallet', address: '0x1234...abcd' } as { label: string },
    });
  };

  const handleAddContract = () => {
    addNode({
      id: `contract-${Date.now()}`,
      type: 'contract',
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: 'Contract', network: 'Ethereum' } as { label: string },
    });
  };

  const handleAddActor = () => {
    addNode({
      id: `actor-${Date.now()}`,
      type: 'actor',
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: 'Actor' },
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setActivePath([{ x: e.clientX - rect.left, y: e.clientY - rect.top }]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    syncManagerRef.current?.updateLocalPresence({ cursor: { x, y } });

    if (isDrawingMode && activePath) {
      setActivePath((prev) => (prev ? [...prev, { x, y }] : [{ x, y }]));
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingMode || !activePath || activePath.length < 2) {
      setActivePath(null);
      return;
    }
    syncManagerRef.current?.upsertShape({
      id: `draw-${Date.now()}`,
      kind: 'freehand',
      x: activePath[0].x,
      y: activePath[0].y,
      color: 'blue',
      points: activePath,
    });
    setActivePath(null);
  };

  const handleExportPNG = async () => {
    if (!canvasRef.current) return;
    const canvas = await html2canvas(canvasRef.current, {
      backgroundColor: '#09090b',
      scale: 2,
    });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `canvas-${roomId}-${Date.now()}.png`;
    link.click();
  };

  const handleExportSVG = () => {
    const svg = serializeShapesToSVG(allExportableShapes);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `canvas-${roomId}-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const json = serializeShapesToJSON(allExportableShapes);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `canvas-${roomId}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-bold">Canvas: {roomId}</span>
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
        </div>
        <span className="text-xs text-zinc-400">
          {collaboratorCount} collaborator{collaboratorCount !== 1 ? 's' : ''} online
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
        <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase self-center mr-2">
          Shapes
        </span>
        <button
          onClick={handleAddRectangle}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Add Rectangle
        </button>
        <button
          onClick={handleAddStickyNote}
          className="rounded bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/30"
        >
          Add Sticky Note
        </button>
        <button
          onClick={() => setIsDrawingMode((prev) => !prev)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            isDrawingMode
              ? 'bg-sky-600 text-white'
              : 'bg-zinc-800 text-white hover:bg-zinc-700'
          }`}
        >
          {isDrawingMode ? 'Drawing: On' : 'Freehand'}
        </button>

        <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase self-center ml-4 mr-2">
          Web3
        </span>
        <button
          onClick={handleAddWallet}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Add Wallet
        </button>
        <button
          onClick={handleAddContract}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Add Contract
        </button>
        <button
          onClick={handleAddActor}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Add Actor
        </button>

        <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase self-center ml-auto mr-2">
          Export
        </span>
        <button
          onClick={() => void handleExportPNG()}
          className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          PNG
        </button>
        <button
          onClick={handleExportSVG}
          className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          SVG
        </button>
        <button
          onClick={handleExportJSON}
          className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          JSON
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative flex-1 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(#333_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
        <div className="relative h-full">
          {/* Freehand SVG overlay */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {binaryShapes
              .filter((s) => s.kind === 'freehand' && s.points && s.points.length > 1)
              .map((stroke) => (
                <path
                  key={stroke.id}
                  d={stroke.points!
                    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                    .join(' ')}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            {activePath && activePath.length > 1 && (
              <path
                d={activePath
                  .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>

          {nodes.map((node) => (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: node.position.x,
                top: node.position.y,
                transform: 'translate(-50%,-50%)',
              }}
              className="rounded border border-white/20 bg-zinc-900 px-3 py-2 text-xs text-white shadow"
            >
              {node.data.label}
            </div>
          ))}

          {binaryShapes
            .filter((s) => s.kind === 'sticky')
            .map((note) => (
              <div
                key={note.id}
                style={{
                  position: 'absolute',
                  left: note.x,
                  top: note.y,
                  width: note.w ?? 180,
                  minHeight: note.h ?? 100,
                }}
                className="rounded border border-yellow-300/60 bg-yellow-200 p-3 text-xs font-medium text-zinc-900 shadow-lg"
              >
                {note.text}
              </div>
            ))}

          {nodes.length === 0 && binaryShapes.length === 0 && (
            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
              Add nodes to get started
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CollaborativeCanvas;
