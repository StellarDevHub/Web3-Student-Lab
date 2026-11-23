'use client';

import React, { useState } from 'react';
import { Play, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export interface CallArg {
  name: string;
  type: string;
  value: string;
}

export interface CallPanelProps {
  contractId?: string;
  functions?: Array<{ name: string; args: Array<{ name: string; type: string }> }>;
  onInvoke?: (fnName: string, args: Record<string, any>) => Promise<any>;
}

export function CallPanel({
  contractId = '',
  functions = [
    { name: 'hello', args: [{ name: 'to', type: 'Symbol' }] },
    { name: 'increment', args: [] },
  ],
  onInvoke,
}: CallPanelProps) {
  const [selectedFn, setSelectedFn] = useState<string>(functions[0]?.name || '');
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);

  const currentFn = functions.find((f) => f.name === selectedFn);

  const handleInvoke = async () => {
    if (!selectedFn) return;
    setInvoking(true);
    setError(null);
    setResult(null);

    try {
      if (onInvoke) {
        const res = await onInvoke(selectedFn, argValues);
        setResult(typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res));
      } else {
        await new Promise((r) => setTimeout(r, 100));
        setResult(`Success: ${selectedFn} invoked`);
      }
    } catch (err: any) {
      setError(err?.message || 'Invocation failed');
    } finally {
      setInvoking(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-white font-mono">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-wider text-zinc-200 uppercase">
          Invoke Contract Function
        </h3>
        {contractId && (
          <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px]">
            {contractId}
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="fn-select" className="block text-xs text-zinc-400 mb-1">
            Function
          </label>
          <select
            id="fn-select"
            value={selectedFn}
            onChange={(e) => {
              setSelectedFn(e.target.value);
              setArgValues({});
            }}
            className="w-full rounded border border-zinc-700 bg-black px-3 py-2 text-xs text-white"
          >
            {functions.map((fn) => (
              <option key={fn.name} value={fn.name}>
                {fn.name}
              </option>
            ))}
          </select>
        </div>

        {currentFn && currentFn.args.length > 0 && (
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400">Arguments</label>
            {currentFn.args.map((arg) => (
              <div key={arg.name} className="flex gap-2 items-center">
                <span className="w-24 text-xs text-zinc-300 truncate">
                  {arg.name} ({arg.type})
                </span>
                <input
                  type="text"
                  placeholder={`Value for ${arg.name}`}
                  value={argValues[arg.name] || ''}
                  onChange={(e) =>
                    setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
                  }
                  className="flex-1 rounded border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleInvoke}
          disabled={invoking}
          className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {invoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {invoking ? 'Invoking...' : 'Invoke'}
        </button>

        {result && (
          <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-950/20 p-3 text-xs text-emerald-300">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Return Value
            </div>
            <pre className="font-mono text-[11px] whitespace-pre-wrap">{result}</pre>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-red-500/40 bg-red-950/20 p-3 text-xs text-red-300">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <AlertCircle className="w-3.5 h-3.5" /> Invocation Error
            </div>
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
export default CallPanel;
