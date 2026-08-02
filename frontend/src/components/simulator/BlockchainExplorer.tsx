'use client';

/**
 * BlockchainExplorer
 *
 * Displays a live stream of simulated blockchain transactions.
 * Supports real-time WebSocket updates and a search/filter UI.
 *
 * Educational: This component demonstrates how blockchain explorers surface
 * transaction data — hash, source, destination, operation type, fee, and status.
 */
import { useState } from 'react';
import {
  ExplorerTransaction,
  UseBlockchainExplorerOptions,
  useBlockchainExplorer,
} from '@/hooks/useBlockchainExplorer';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ExplorerTransaction['status'] }) {
  const colors =
    status === 'SUCCESS'
      ? 'bg-green-500/10 text-green-400'
      : status === 'FAILED'
        ? 'bg-red-500/10 text-red-400'
        : 'bg-yellow-500/10 text-yellow-400';

  return (
    <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase ${colors}`}>
      {status}
    </span>
  );
}

// ─── Connection indicator ──────────────────────────────────────────────────────

function ConnectionDot({ status }: { status: string }) {
  const color =
    status === 'connected'
      ? 'animate-pulse bg-green-500'
      : status === 'connecting'
        ? 'animate-pulse bg-yellow-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-gray-600';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />;
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: ExplorerTransaction }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`Transaction ${tx.hash}, status ${tx.status}`}
      >
        <td className="py-3 pr-4 font-mono text-[11px] font-bold text-red-400">{tx.hash.slice(0, 8)}…</td>
        <td className="py-3 pr-4 text-[11px] text-gray-300">{tx.operation}</td>
        <td className="py-3 pr-4 text-[11px] text-gray-400">
          {tx.amount} {tx.asset}
        </td>
        <td className="py-3 pr-4 text-[11px] text-gray-500">{tx.fee} XLM</td>
        <td className="py-3 pr-4 text-[11px] text-gray-500">#{tx.ledger}</td>
        <td className="py-3 text-right">
          <StatusBadge status={tx.status} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-900/60">
          <td colSpan={6} className="px-4 py-3 text-[11px] text-gray-400">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              <div>
                <dt className="text-gray-600 uppercase tracking-widest text-[9px]">Full Hash</dt>
                <dd className="font-mono break-all">{tx.hash}</dd>
              </div>
              <div>
                <dt className="text-gray-600 uppercase tracking-widest text-[9px]">Source</dt>
                <dd className="font-mono break-all">{tx.source}</dd>
              </div>
              <div>
                <dt className="text-gray-600 uppercase tracking-widest text-[9px]">Destination</dt>
                <dd className="font-mono break-all">{tx.destination}</dd>
              </div>
              <div>
                <dt className="text-gray-600 uppercase tracking-widest text-[9px]">Timestamp</dt>
                <dd>{new Date(tx.timestamp).toLocaleString()}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface BlockchainExplorerProps extends UseBlockchainExplorerOptions {
  /** Optional heading override */
  title?: string;
}

export function BlockchainExplorer({ title = 'Blockchain Explorer', wsUrl, maxTransactions }: BlockchainExplorerProps) {
  const { transactions, stats, connectionStatus, error, isLive, toggleLive, clearTransactions } =
    useBlockchainExplorer({ wsUrl, maxTransactions });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExplorerTransaction['status'] | 'ALL'>('ALL');

  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      !search ||
      tx.hash.toLowerCase().includes(search.toLowerCase()) ||
      tx.operation.toLowerCase().includes(search.toLowerCase()) ||
      tx.source.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || tx.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <section
      className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-zinc-950 p-6 font-mono text-white shadow-2xl"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
        <div className="border-l-4 border-red-600 pl-4">
          <h2 className="text-xl font-black uppercase tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[10px] tracking-widest text-gray-500 uppercase">
            Stellar Network Transaction Monitor
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div
            className="flex items-center gap-2 rounded border border-white/10 bg-black px-3 py-1.5"
            role="status"
            aria-live="polite"
            aria-label={`Connection: ${connectionStatus}`}
          >
            <ConnectionDot status={connectionStatus} />
            <span className="text-[10px] font-bold uppercase tracking-widest capitalize">
              {connectionStatus}
            </span>
          </div>

          <button
            onClick={toggleLive}
            className="bg-white px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-black transition-colors hover:bg-gray-200"
            aria-pressed={isLive}
            aria-label={isLive ? 'Pause live feed' : 'Resume live feed'}
          >
            {isLive ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={clearTransactions}
            className="rounded border border-white/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:border-red-600 hover:text-red-400"
            aria-label="Clear all transactions"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <p role="alert" className="rounded border border-red-600/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {/* Stats */}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Explorer statistics">
        {[
          { label: 'Total TXs', value: stats.totalTransactions.toLocaleString() },
          { label: 'Success Rate', value: `${stats.successRate}%` },
          { label: 'Avg Fee', value: `${stats.averageFee} XLM` },
          { label: 'Latest Ledger', value: stats.latestLedger ? `#${stats.latestLedger}` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-white/5 bg-black p-4">
            <dt className="mb-1 text-[9px] uppercase tracking-widest text-gray-600">{label}</dt>
            <dd className="text-lg font-black text-red-400">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Search hash, operation, source…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-white/10 bg-black px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-red-600 focus:outline-none"
          aria-label="Search transactions"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded border border-white/10 bg-black px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
          aria-label="Filter by status"
        >
          <option value="ALL">All Statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="PENDING">Pending</option>
        </select>
      </div>

      {/* Transaction table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" aria-label="Transaction list" aria-live="polite">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-gray-600">
              <th className="pb-3 font-normal pr-4" scope="col">Hash</th>
              <th className="pb-3 font-normal pr-4" scope="col">Operation</th>
              <th className="pb-3 font-normal pr-4" scope="col">Amount</th>
              <th className="pb-3 font-normal pr-4" scope="col">Fee</th>
              <th className="pb-3 font-normal pr-4" scope="col">Ledger</th>
              <th className="pb-3 font-normal text-right" scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-xs text-gray-700 italic">
                  {transactions.length === 0 ? 'Awaiting transactions…' : 'No transactions match your filter.'}
                </td>
              </tr>
            ) : (
              filtered.map((tx) => <TxRow key={tx.id} tx={tx} />)
            )}
          </tbody>
        </table>
      </div>

      <p className="text-right text-[10px] text-gray-700">
        Showing {filtered.length} of {transactions.length} transactions
      </p>
    </section>
  );
}
