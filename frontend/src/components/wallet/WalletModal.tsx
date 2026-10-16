'use client';

import React from 'react';
import { X, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { useWallet, WALLET_PROVIDERS } from '@/contexts/WalletContext';

export interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { publicKey, activeWallet, isConnecting, error, connect, disconnect } = useWallet();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-white font-mono shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-6 w-6 text-red-500" />
          <h2 className="text-lg font-bold tracking-tight">Connect Stellar Wallet</h2>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/20 p-3 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {publicKey ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </div>
              <p className="text-xs text-zinc-400 mb-2">Active Provider: {activeWallet}</p>
              <p className="font-mono text-xs text-zinc-200 break-all bg-black/60 p-2 rounded border border-white/5">
                {publicKey}
              </p>
            </div>

            <button
              onClick={() => disconnect()}
              className="w-full rounded-lg bg-red-600/20 border border-red-500/40 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-600/30 transition-colors"
            >
              Disconnect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 mb-2">
              Select a wallet provider to connect your account:
            </p>
            {WALLET_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={async () => {
                  try {
                    await connect(provider.id);
                  } catch {}
                }}
                disabled={isConnecting}
                className="w-full flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-left text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-sm">
                    {provider.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{provider.name}</div>
                    <div className="text-[10px] text-zinc-500">{provider.description}</div>
                  </div>
                </div>
                {isConnecting && activeWallet === provider.id && (
                  <span className="text-[10px] text-blue-400">Connecting...</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WalletModal;
