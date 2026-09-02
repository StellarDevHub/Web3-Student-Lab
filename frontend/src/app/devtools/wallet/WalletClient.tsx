'use client';

import { useWallet, WALLET_PROVIDERS } from '@/contexts/WalletContext';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const TransactionStateChart = dynamic(
  () => import('@/components/wallet/TransactionStateChart').then(mod => mod.TransactionStateChart),
  { ssr: false }
);

function truncate(pk: string) {
  return `${pk.slice(0, 6)}...${pk.slice(-6)}`;
}

export default WalletPageImpl;

function WalletPageImpl() {
  const {
    publicKey,
    activeWallet,
    isConnecting,
    error,
    transactionState,
    transactionContext,
    connect,
    disconnect,
  } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = async (name: string) => {
    setConnectError(null);
    try {
      await connect(name);
      setShowModal(false);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Connection failed');
    }
  };

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-3xl font-black text-red-500">WALLET CONNECT</h1>

        {publicKey ? (
          <div className="rounded-lg border border-green-500/30 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
              <span className="text-sm font-bold text-green-400">CONNECTED — {activeWallet}</span>
            </div>
            <div className="mb-4 rounded bg-black p-3 font-mono text-sm break-all text-gray-300">
              {publicKey}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(publicKey)}
                className="rounded bg-zinc-700 px-4 py-2 text-sm font-bold hover:bg-zinc-600"
              >
                COPY ADDRESS
              </button>
              <button
                onClick={disconnect}
                className="rounded bg-red-600 px-4 py-2 text-sm font-bold hover:bg-red-700"
              >
                DISCONNECT
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="rounded bg-zinc-700 px-4 py-2 text-sm font-bold hover:bg-zinc-600"
              >
                SWITCH WALLET
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-zinc-900 p-8 text-center">
            <div className="mb-4 text-6xl">🔗</div>
            <p className="mb-6 text-gray-400">
              Connect a Stellar wallet to interact with the network
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="rounded bg-red-600 px-8 py-3 font-bold hover:bg-red-700"
            >
              CONNECT WALLET
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded border border-red-500/50 bg-red-900/30 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Wallet Info Cards */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {WALLET_PROVIDERS.map((p) => (
            <div key={p.name} className="rounded-lg border border-white/10 bg-zinc-900 p-4">
              <div className="mb-2 text-3xl">{p.icon}</div>
              <div className="mb-1 text-sm font-bold">{p.name}</div>
              <div className={`text-xs ${p.isInstalled() ? 'text-green-400' : 'text-gray-500'}`}>
                {p.isInstalled() ? 'Detected' : 'Not installed'}
              </div>
            </div>
          ))}
        </div>

        <TransactionStateChart state={transactionState} context={transactionContext} />
      </div>

      {/* Connect Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/20 bg-zinc-900 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-black">SELECT WALLET</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-xl text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {connectError && (
              <div className="mb-4 rounded border border-red-500/50 bg-red-900/30 p-3 text-xs text-red-400">
                {connectError}
              </div>
            )}

            <div className="space-y-3">
              {WALLET_PROVIDERS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleConnect(p.name)}
                  disabled={isConnecting}
                  className="flex w-full items-center gap-4 rounded-lg border border-white/10 bg-black p-4 transition-all hover:border-red-500/50 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <span className="text-2xl">{p.icon}</span>
                  <div className="text-left">
                    <div className="text-sm font-bold">{p.name}</div>
                    <div
                      className={`text-xs ${p.isInstalled() ? 'text-green-400' : 'text-gray-500'}`}
                    >
                      {p.isInstalled() ? 'Ready to connect' : 'Install required'}
                    </div>
                  </div>
                  {activeWallet === p.name && (
                    <span className="ml-auto text-xs font-bold text-green-400">ACTIVE</span>
                  )}
                </button>
              ))}
            </div>

            {isConnecting && (
              <div className="mt-4 text-center text-sm text-gray-400">Connecting...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
