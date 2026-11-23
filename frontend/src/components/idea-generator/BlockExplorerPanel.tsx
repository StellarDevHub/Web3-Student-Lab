'use client';

import { useHackathonBlockExplorer } from '@/hooks/useHackathonBlockExplorer';
import { EXPLORER_OPERATIONS, buildStellarExpertLink } from '@/lib/idea-generator/blockExplorer';

function StatusBadge({ status }: { status: string }) {
  const colors =
    status === 'SUCCESS'
      ? 'bg-green-500/10 text-green-400'
      : status === 'FAILED'
        ? 'bg-red-500/10 text-red-400'
        : 'bg-yellow-500/10 text-yellow-400';
  return (
    <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase ${colors}`}>{status}</span>
  );
}

export default function BlockExplorerPanel() {
  const {
    filteredTransactions,
    filteredStats,
    filter,
    setFilter,
    suggestedIdeas,
    connectionStatus,
    isLive,
    toggleLive,
    clearTransactions,
  } = useHackathonBlockExplorer();

  return (
    <div className="space-y-6">
      <div className="bg-bg-secondary border-border-theme grid grid-cols-2 gap-4 rounded-2xl border p-6 sm:grid-cols-4">
        <div>
          <p className="text-text-secondary text-[10px] font-bold tracking-widest uppercase">Transactions</p>
          <p className="text-2xl font-black">{filteredStats.totalTransactions}</p>
        </div>
        <div>
          <p className="text-text-secondary text-[10px] font-bold tracking-widest uppercase">Success Rate</p>
          <p className="text-2xl font-black">{filteredStats.successRate}%</p>
        </div>
        <div>
          <p className="text-text-secondary text-[10px] font-bold tracking-widest uppercase">Avg Fee</p>
          <p className="text-2xl font-black">{filteredStats.averageFee}</p>
        </div>
        <div>
          <p className="text-text-secondary text-[10px] font-bold tracking-widest uppercase">Latest Ledger</p>
          <p className="text-2xl font-black">#{filteredStats.latestLedger}</p>
        </div>
      </div>

      <div className="bg-bg-secondary border-border-theme flex flex-wrap gap-3 rounded-2xl border p-4">
        <input
          aria-label="Search transactions"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          placeholder="Search hash, account, operation…"
          className="bg-background border-border-theme min-w-[200px] flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-red-500"
        />
        <select
          aria-label="Filter by status"
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as typeof filter.status }))}
          className="bg-background border-border-theme rounded-lg border px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="PENDING">Pending</option>
        </select>
        <select
          aria-label="Filter by operation"
          value={filter.operation}
          onChange={(e) => setFilter((f) => ({ ...f, operation: e.target.value }))}
          className="bg-background border-border-theme rounded-lg border px-3 py-2 text-sm"
        >
          {EXPLORER_OPERATIONS.map((op) => (
            <option key={op} value={op}>{op === 'ALL' ? 'All operations' : op}</option>
          ))}
        </select>
        <button type="button" onClick={toggleLive} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold uppercase">
          {isLive ? 'Pause' : 'Resume'}
        </button>
        <button type="button" onClick={clearTransactions} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold uppercase">
          Clear
        </button>
        <span className="text-text-secondary self-center text-xs">{connectionStatus}</span>
      </div>

      <div className="bg-bg-secondary border-border-theme overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-text-secondary border-b border-white/10 text-[10px] font-bold tracking-widest uppercase">
              <th className="px-4 py-3">Hash</th>
              <th className="px-4 py-3">Operation</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Ledger</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-text-secondary px-4 py-8 text-center">
                  No transactions match your filters.
                </td>
              </tr>
            ) : (
              filteredTransactions.slice(0, 30).map((tx) => (
                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <a
                      href={buildStellarExpertLink(tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-red-400 hover:underline"
                    >
                      {tx.hash.slice(0, 10)}…
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs">{tx.operation}</td>
                  <td className="px-4 py-3 text-xs">{tx.amount} {tx.asset}</td>
                  <td className="px-4 py-3 text-xs">{tx.fee}</td>
                  <td className="px-4 py-3 text-xs">#{tx.ledger}</td>
                  <td className="px-4 py-3"><StatusBadge status={tx.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {suggestedIdeas.length > 0 && (
        <aside aria-label="Hackathon idea suggestions from chain activity" className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
          <h3 className="text-text-secondary mb-3 text-xs font-bold tracking-widest uppercase">Ideas from Live Activity</h3>
          <ul className="space-y-2">
            {suggestedIdeas.map((idea) => (
              <li key={idea} className="text-sm text-gray-300">• {idea}</li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
