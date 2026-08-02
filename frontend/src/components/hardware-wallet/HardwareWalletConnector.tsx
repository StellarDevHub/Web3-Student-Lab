'use client';

import { useState } from 'react';
import { useHardwareWallet } from '@/hooks/useHardwareWallet';

export default function HardwareWalletConnector() {
  const { isSupported, isConnected, isBusy, address, error, connect, disconnect, signPersonalMessage } = useHardwareWallet();
  const [message, setMessage] = useState('This is a sample contract signing request.');
  const [signature, setSignature] = useState<string | null>(null);

  const handleSign = async () => {
    const result = await signPersonalMessage(message);
    setSignature(result);
  };

  return (
    <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-950/90 p-6 text-slate-100 shadow-xl">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">Hardware Wallet Integration</h1>
        <p className="text-slate-400">
          Connect a Ledger-compatible device directly via WebHID for secure transaction signing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">Browser support</p>
          <p className="mt-2 text-lg">{isSupported ? 'Supported' : 'Unsupported'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">Wallet status</p>
          <p className="mt-2 text-lg">{isConnected ? 'Connected' : 'Disconnected'}</p>
          {address ? <p className="mt-2 text-slate-300">{address}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded bg-cyan-500 px-5 py-2 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isBusy || !isSupported}
          onClick={() => void connect()}
        >
          Connect Wallet
        </button>
        <button
          type="button"
          className="rounded bg-slate-700 px-5 py-2 text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConnected || isBusy}
          onClick={() => void disconnect()}
        >
          Disconnect
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <label className="text-sm font-medium text-slate-300">
          Message to sign
          <textarea
            className="mt-2 h-24 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded bg-lime-500 px-5 py-2 font-semibold text-slate-950 hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isConnected || isBusy}
          onClick={handleSign}
        >
          Request signature
        </button>
        {signature ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-200">
            <p className="font-medium text-slate-100">Signature</p>
            <pre className="mt-2 overflow-x-auto text-xs leading-5 text-slate-300">{signature}</pre>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
