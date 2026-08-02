'use client';

import { DecodedEvent, decodeRpcEvent, SOROBAN_RPC_URL } from '@/lib/soroban-tools';
import { rpc } from '@stellar/stellar-sdk';
import { useEffect, useState } from 'react';

// ─── Trace View ───────────────────────────────────────────────────────────────

function TraceView({ events }: { events: DecodedEvent[] }) {
  const [txHash, setTxHash] = useState('');
  const txEvents = txHash ? events.filter((e) => e.txHash === txHash) : [];
  const uniqueTxs = [...new Set(events.map((e) => e.txHash))];

  return (
    <div className="mb-6 rounded-lg border border-white/10 bg-zinc-900 p-4">
      <div className="mb-3 text-xs font-bold text-gray-400">TRACE VIEW</div>
      <select
        value={txHash}
        onChange={(e) => setTxHash(e.target.value)}
        className="mb-4 w-full rounded border border-white/20 bg-black px-3 py-2 font-mono text-sm"
      >
        <option value="">Select a transaction hash...</option>
        {uniqueTxs.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      {txHash && txEvents.length === 0 && (
        <div className="py-4 text-center text-sm text-gray-500">No events for this transaction</div>
      )}
      {txEvents.length > 0 && (
        <div className="relative pl-6">
          <div className="absolute top-0 bottom-0 left-2 w-px bg-red-500/30" />
          {txEvents.map((evt, i) => (
            <div key={evt.id} className="relative mb-4">
              <div className="absolute top-2 -left-4 h-3 w-3 rounded-full border-2 border-black bg-red-500" />
              <div className="rounded border border-white/10 bg-black p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-red-400">#{i + 1}</span>
                  <span className="text-xs text-gray-400">{evt.type}</span>
                  <span className="font-mono text-xs text-gray-500">
                    {evt.contractId.slice(0, 8)}...
                  </span>
                </div>
                <pre className="overflow-x-auto font-mono text-xs text-gray-300">
                  {JSON.stringify({ topics: evt.topics, value: evt.value }, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [contractFilter, setContractFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const [lastCursor, setLastCursor] = useState('');

  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(async () => {
      try {
        const server = new rpc.Server(SOROBAN_RPC_URL);
        const filters: rpc.Api.EventFilter[] = [];
        if (contractFilter) {
          filters.push({ contractIds: [contractFilter] });
        }
        if (topicFilter) {
          filters.push({ topics: [[topicFilter]] });
        }
        const result = await server.getEvents({
          filters: filters,
          ...(lastCursor ? { cursor: lastCursor } : { startLedger: 0 }),
          limit: 20,
        });
        const decoded = result.events.map(decodeRpcEvent);
        setEvents((prev) => [...decoded, ...prev].slice(0, 100));
        if (result.events.length > 0) {
          setLastCursor(result.latestLedger.toString());
        }
      } catch (e) {
        console.error('Failed to fetch events:', e);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isPolling, contractFilter, topicFilter, lastCursor]);

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-3xl font-black text-red-500">SOROBAN EVENT LISTENER</h1>

        {/* Controls */}
        <div className="mb-6 space-y-4 rounded-lg border border-white/10 bg-zinc-900 p-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="mb-2 block text-xs font-bold text-gray-400">CONTRACT ID</label>
              <input
                type="text"
                value={contractFilter}
                onChange={(e) => setContractFilter(e.target.value)}
                placeholder="C..."
                className="w-full rounded border border-white/20 bg-black px-3 py-2 font-mono text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-2 block text-xs font-bold text-gray-400">TOPIC FILTER</label>
              <input
                type="text"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                placeholder="transfer"
                className="w-full rounded border border-white/20 bg-black px-3 py-2 font-mono text-sm"
              />
            </div>
            <button
              onClick={() => setIsPolling(!isPolling)}
              className={`rounded px-6 py-2 text-sm font-bold ${
                isPolling ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isPolling ? 'STOP' : 'START'}
            </button>
            <button
              onClick={() => setEvents([])}
              className="rounded bg-zinc-700 px-6 py-2 text-sm font-bold hover:bg-zinc-600"
            >
              CLEAR
            </button>
          </div>
        </div>

        {/* Trace View */}
        {events.length > 0 && <TraceView events={events} />}

        {/* Event List */}
        <div className="space-y-3">
          {events.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-zinc-900 p-8 text-center text-gray-500">
              {isPolling ? 'Listening for events...' : 'Click START to begin listening'}
            </div>
          )}
          {events.map((evt, i) => (
            <div
              key={`${evt.id}-${i}`}
              className="rounded-lg border border-white/10 bg-zinc-900 p-4"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <span className="text-xs font-bold text-red-500">{evt.type}</span>
                  <span className="ml-3 text-xs text-gray-500">Ledger {evt.ledger}</span>
                  <span className="ml-3 text-xs text-gray-500">
                    {new Date(evt.ledgerClosedAt).toLocaleTimeString()}
                  </span>
                </div>
                <span className="font-mono text-xs text-gray-400">
                  {evt.contractId.slice(0, 8)}...
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-xs font-bold text-gray-400">TOPICS:</span>
                  <pre className="mt-1 overflow-x-auto rounded bg-black p-2 font-mono text-xs">
                    {JSON.stringify(evt.topics, null, 2)}
                  </pre>
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-400">VALUE:</span>
                  <pre className="mt-1 overflow-x-auto rounded bg-black p-2 font-mono text-xs">
                    {JSON.stringify(evt.value, null, 2)}
                  </pre>
                </div>
                <div className="text-xs text-gray-500">
                  TX: <span className="font-mono">{evt.txHash}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
