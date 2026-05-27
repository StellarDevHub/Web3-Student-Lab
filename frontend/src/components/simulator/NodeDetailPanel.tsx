import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ExternalLink, Shield, Wallet, X } from 'lucide-react';
import React from 'react';
import { NetworkNode } from '../../lib/visualization/ForceSimulation';

interface NodeDetailPanelProps {
  node: NetworkNode;
  onClose: () => void;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, onClose }) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 300, opacity: 0 }}
        className="absolute top-0 right-0 z-30 flex h-full w-80 flex-col gap-6 border-l border-white/10 bg-black/80 p-6 backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Account details for ${node.label || node.id}`}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-xs font-black tracking-[0.2em] text-red-500 uppercase"
            id="node-detail-title"
          >
            Account Details
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Close account details panel"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span
            className="text-[10px] font-bold tracking-widest text-gray-500 uppercase"
            id="public-key-label"
          >
            Public Key
          </span>
          <div
            className="group flex items-center justify-between rounded border border-white/5 bg-zinc-900 p-3 font-mono text-[10px] break-all text-gray-300"
            aria-labelledby="public-key-label"
          >
            <span>{node.id}</span>
            <ExternalLink
              size={12}
              className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-zinc-900 p-4">
            <Wallet size={16} className="text-blue-500" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-500 uppercase">Balance</span>
              <span className="text-sm font-black text-white italic">
                1,240.50 <span className="text-[10px] text-gray-600 not-italic">XLM</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-zinc-900 p-4">
            <Activity size={16} className="text-green-500" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-500 uppercase">Operations</span>
              <span className="text-sm font-black text-white italic">42</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-2 text-[10px] font-black tracking-widest text-gray-500 uppercase">
            <Shield size={12} aria-hidden="true" />
            Security Status
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-400">Multi-sig</span>
              <span className="rounded-full bg-green-500/10 px-2 py-0.5 font-bold text-green-500">
                ENABLED
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-400">Account Flags</span>
              <span className="font-bold text-white italic">AUTH_REQUIRED</span>
            </div>
          </div>
        </div>

        <div className="mt-auto">
          <button
            className="w-full rounded bg-red-600 py-3 text-[10px] font-black tracking-widest text-white uppercase transition-colors hover:bg-red-700"
            aria-label={`View account ${node.label || node.id} on Stellar Explorer`}
          >
            View on Explorer
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
