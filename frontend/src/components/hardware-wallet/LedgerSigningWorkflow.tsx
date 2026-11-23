'use client';

import { useHardwareWallet } from '@/hooks/useHardwareWallet';
import { useState } from 'react';

export default function LedgerSigningWorkflow() {
  const {
    isSupported,
    isConnected,
    isBusy,
    connectionStatus,
    address,
    publicKey,
    accounts,
    derivationPath,
    error,
    warning,
    devicePrompt,
    connect,
    disconnect,
    signTransaction,
    discoverAccounts,
    setDerivationPath,
    clearError,
  } = useHardwareWallet();

  const [xdr, setXdr] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const handleSign = async () => {
    if (!xdr.trim()) return;
    clearError();
    setSignature(null);
    const result = await signTransaction(xdr.trim());
    setSignature(result);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    clearError();
    await discoverAccounts(5);
    setDiscovering(false);
  };

  const statusColor: Record<string, string> = {
    disconnected: 'text-slate-400',
    connecting: 'text-amber-400',
    connected: 'text-emerald-400',
    'awaiting-confirmation': 'text-cyan-400',
  };

  return (
    <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-950/90 p-6 text-slate-100 shadow-xl">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Ledger Signing Workflow</h2>
        <p className="text-sm text-slate-400">
          Sign Stellar XDR transactions directly on your Ledger device via the Stellar app.
        </p>
      </div>

      {/* Status bar */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs text-slate-400">WebHID support</p>
          <p className={`mt-1 font-medium ${isSupported ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isSupported ? 'Available' : 'Unavailable'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs text-slate-400">Connection</p>
          <p className={`mt-1 font-medium ${statusColor[connectionStatus] ?? 'text-slate-300'}`}>
            {connectionStatus}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs text-slate-400">Derivation path</p>
          <input
            className="mt-1 w-full bg-transparent font-mono text-sm text-slate-200 outline-none"
            value={derivationPath}
            onChange={(e) => setDerivationPath(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Address */}
      {address && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs text-slate-400">Stellar address</p>
          <p className="mt-1 break-all font-mono text-sm text-slate-200">{address}</p>
          {publicKey && (
            <p className="mt-1 break-all font-mono text-xs text-slate-500">pubkey: {publicKey}</p>
          )}
        </div>
      )}

      {/* Connect / Disconnect */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded bg-cyan-500 px-5 py-2 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isBusy || !isSupported || isConnected}
          onClick={() => void connect()}
        >
          Connect Ledger
        </button>
        <button
          type="button"
          className="rounded bg-slate-700 px-5 py-2 text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConnected || isBusy}
          onClick={() => void disconnect()}
        >
          Disconnect
        </button>
        <button
          type="button"
          className="rounded bg-indigo-600 px-5 py-2 text-slate-100 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConnected || isBusy || discovering}
          onClick={() => void handleDiscover()}
        >
          {discovering ? 'Discovering…' : 'Discover Accounts'}
        </button>
      </div>

      {/* Device prompt */}
      {devicePrompt && (
        <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
          ⚡ {devicePrompt}
        </div>
      )}

      {/* Discovered accounts */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">Discovered accounts</p>
          {accounts.map((acc) => (
            <div key={acc.path} className="rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-300">
              <span className="text-slate-500 mr-2">{acc.path}</span>
              {acc.address}
            </div>
          ))}
        </div>
      )}

      {/* XDR signing */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-300">
          Transaction XDR
          <textarea
            className="mt-2 h-32 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500"
            placeholder="Paste base64-encoded XDR envelope here…"
            value={xdr}
            onChange={(e) => setXdr(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded bg-lime-500 px-5 py-2 font-semibold text-slate-950 hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConnected || isBusy || !xdr.trim()}
          onClick={() => void handleSign()}
        >
          Sign on Ledger
        </button>
      </div>

      {/* Signature result */}
      {signature && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium text-emerald-300">Signature</p>
          <pre className="mt-2 overflow-x-auto break-all font-mono text-xs text-emerald-200">{signature}</pre>
        </div>
      )}

      {/* Warning */}
      {warning && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          ⚠ {warning}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500 bg-rose-500/10 p-4">
          <p className="flex-1 text-sm text-rose-200">{error}</p>
          <button
            type="button"
            className="text-xs text-rose-400 hover:text-rose-200"
            onClick={clearError}
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
