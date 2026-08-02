'use client';

import React from 'react';
import { useCanvasCollaboration, useSharedCanvas, useAwareness, CanvasNode } from '@/hooks/useCanvasCollaboration';

interface CollaborativeCanvasProps {
  roomId: string;
  userId: string;
}

export function CollaborativeCanvas({ roomId, userId }: CollaborativeCanvasProps) {
  const { doc, awareness, isConnected } = useCanvasCollaboration(roomId, userId);
  const { nodes, edges, addNode, updateNode, deleteNode, addEdge, deleteEdge } = useSharedCanvas(doc);
  const remoteUsers = useAwareness(awareness);

  const collaboratorCount = remoteUsers.length;

  const handleAddRectangle = () => {
    addNode({
      id: `rect-${Date.now()}`,
      type: 'default',
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: 'Rectangle' },
    });
  };

  const handleAddWallet = () => {
    addNode({
      id: `wallet-${Date.now()}`,
      type: 'wallet',
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: 'Wallet', address: '0x1234...abcd' },
    });
  };

  const handleAddContract = () => {
    addNode({
      id: `contract-${Date.now()}`,
      type: 'contract',
      position: { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: 'Contract', network: 'Ethereum' },
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
      <div className="flex gap-2 border-b border-white/10 px-4 py-2">
        <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase self-center mr-2">
          Shapes
        </span>
        <button
          onClick={handleAddRectangle}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Add Rectangle
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
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#333_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
        <div className="relative h-full">
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
          {nodes.length === 0 && (
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
