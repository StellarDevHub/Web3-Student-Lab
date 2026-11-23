import { Handle, Position, NodeProps } from 'reactflow';
import React from 'react';

export function WalletNode({ data }: NodeProps) {
  return (
    <div className="rounded-xl border-2 border-purple-500 bg-purple-100 p-4 shadow-md w-48">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <div className="flex flex-col items-center">
        <div className="text-2xl mb-2">👛</div>
        <div className="font-bold text-purple-900">{data.label}</div>
        <div className="text-xs text-purple-700 mt-1">{data.address || '0x...'}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
}

export function ContractNode({ data }: NodeProps) {
  return (
    <div className="rounded-xl border-2 border-blue-500 bg-blue-100 p-4 shadow-md w-48">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <div className="flex flex-col items-center">
        <div className="text-2xl mb-2">📄</div>
        <div className="font-bold text-blue-900">{data.label}</div>
        <div className="text-xs text-blue-700 mt-1">{data.network || 'Ethereum'}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
}

export function ActorNode({ data }: NodeProps) {
  return (
    <div className="rounded-full border-2 border-green-500 bg-green-100 p-4 shadow-md w-32 h-32 flex flex-col justify-center items-center">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <div className="text-3xl mb-1">👤</div>
      <div className="font-bold text-green-900 text-sm text-center">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
}

export const nodeTypes = {
  wallet: WalletNode,
  contract: ContractNode,
  actor: ActorNode,
};
