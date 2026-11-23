'use client';

import {
  SimulationNetwork,
  SimulationResult,
  formatFee,
  simulateWeb3Transaction,
} from '@/lib/web3-transaction-simulator';
import { Activity, AlertTriangle, Play, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

const DEFAULT_STELLAR_RPC = 'https://soroban-testnet.stellar.org';
const DEFAULT_EVM_RPC = 'https://ethereum.publicnode.com';

function parseEvmTransaction(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Transaction JSON must be an object.');
    }
    return parsed;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid EVM transaction JSON.');
  }
}

function ResultPanel({ result }: { result: SimulationResult }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
          <div className="text-xs font-bold text-zinc-500">STATUS</div>
          <div className={result.status === 'success' ? 'mt-2 font-black text-green-400' : 'mt-2 font-black text-red-400'}>
            {result.status.toUpperCase()}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
          <div className="text-xs font-bold text-zinc-500">BUFFER</div>
          <div className="mt-2 font-mono text-xl font-black text-white">{result.fee.bufferPercent}%</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
          <div className="text-xs font-bold text-zinc-500">CONGESTION</div>
          <div className="mt-2 font-black text-white">{result.fee.congestion.toUpperCase()}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
          <div className="text-xs font-bold text-zinc-500">{result.network === 'stellar' ? 'FEE' : 'GAS LIMIT'}</div>
          <div className="mt-2 font-mono text-xl font-black text-white">
            {formatFee(result.network === 'stellar' ? result.fee.bufferedFee : (result.gasLimit ?? result.fee.bufferedFee))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-500">
          <Zap className="h-4 w-4" />
          SIMULATION SUMMARY
        </div>
        <p className="text-sm text-zinc-200">{result.summary}</p>
        <p className="mt-2 text-xs text-zinc-500">{result.fee.source}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
          <div className="mb-3 text-xs font-bold text-zinc-500">STATE CHANGES</div>
          <div className="space-y-3">
            {result.stateChanges.length === 0 ? (
              <div className="text-sm text-zinc-500">No state changes returned by RPC.</div>
            ) : (
              result.stateChanges.map((change, index) => (
                <div key={`${change.target}:${index}`} className="rounded-md bg-black p-3">
                  <div className="text-xs font-bold text-red-300">{change.type.toUpperCase()}</div>
                  <div className="mt-1 break-all font-mono text-xs text-zinc-400">{change.target}</div>
                  <div className="mt-2 text-sm text-zinc-200">{change.description}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
          <div className="mb-3 text-xs font-bold text-zinc-500">EVENTS & DIAGNOSTICS</div>
          <div className="space-y-3">
            {[...result.events.map((event) => event.description), ...result.diagnostics].map((item, index) => (
              <div key={`${item}:${index}`} className="rounded-md bg-black p-3 text-sm text-zinc-300">
                {item}
              </div>
            ))}
            {result.events.length === 0 && result.diagnostics.length === 0 && (
              <div className="text-sm text-zinc-500">No events or diagnostics returned.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TransactionSimulatorPanel() {
  const [network, setNetwork] = useState<SimulationNetwork>('stellar');
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_STELLAR_RPC);
  const [payload, setPayload] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeholder = useMemo(
    () =>
      network === 'stellar'
        ? 'Paste a base64 Stellar TransactionEnvelope XDR containing one invokeHostFunction operation...'
        : '{\n  "from": "0x...",\n  "to": "0x...",\n  "data": "0x...",\n  "value": "0x0"\n}',
    [network]
  );

  function changeNetwork(value: SimulationNetwork) {
    setNetwork(value);
    setRpcUrl(value === 'stellar' ? DEFAULT_STELLAR_RPC : DEFAULT_EVM_RPC);
    setResult(null);
    setError(null);
  }

  async function runSimulation() {
    if (!payload.trim() || isSimulating) return;

    setIsSimulating(true);
    setError(null);

    try {
      const simulation = await simulateWeb3Transaction(
        network === 'stellar'
          ? {
              network,
              rpcUrl,
              transactionXdr: payload,
              instructionLeeway: 3_000_000,
            }
          : {
              network,
              rpcUrl,
              transaction: parseEvmTransaction(payload),
              blockTag: 'latest',
            }
      );
      setResult(simulation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction simulation failed.');
      setResult(null);
    } finally {
      setIsSimulating(false);
    }
  }

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black text-red-500">TRANSACTION SIMULATOR</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Simulate before signing, inspect returned state impact, and apply a congestion-aware gas or resource-fee buffer.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-white/10 bg-zinc-950 p-1">
            {(['stellar', 'evm'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeNetwork(item)}
                className={`rounded px-4 py-2 text-xs font-black tracking-widest ${
                  network === item ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <section className="rounded-lg border border-white/10 bg-zinc-900 p-4">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-zinc-500">RPC URL</span>
                <input
                  value={rpcUrl}
                  onChange={(event) => setRpcUrl(event.target.value)}
                  className="w-full rounded-md border border-white/10 bg-black px-3 py-2 font-mono text-sm outline-none focus:border-red-500"
                />
              </label>
              <button
                type="button"
                onClick={runSimulation}
                disabled={!payload.trim() || isSimulating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSimulating ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                SIMULATE
              </button>
              {error && (
                <div className="flex gap-2 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              placeholder={placeholder}
              className="min-h-64 w-full resize-y rounded-md border border-white/10 bg-black p-4 font-mono text-sm text-zinc-100 outline-none focus:border-red-500"
            />
          </div>
        </section>

        {result && <ResultPanel result={result} />}
      </div>
    </div>
  );
}

