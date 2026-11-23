'use client';

import {
  getWeb3TransactionStatus,
  web3TransactionStateOrder,
  type Web3TransactionContext,
  type Web3TransactionStatus,
} from '@/lib/web3/transactionMachine';

const labels: Record<Web3TransactionStatus, string> = {
  idle: 'Idle',
  detectingWallet: 'Detecting',
  connectingWallet: 'Connecting',
  connected: 'Connected',
  switchingNetwork: 'Network',
  awaitingSignature: 'Signature',
  submittingTransaction: 'Submitting',
  confirmed: 'Confirmed',
  failed: 'Failed',
  disconnected: 'Disconnected',
};

interface TransactionStateChartProps {
  state: unknown;
  context: Web3TransactionContext;
}

export function TransactionStateChart({ state, context }: TransactionStateChartProps) {
  const activeState = getWeb3TransactionStatus(state);

  return (
    <section
      className="mt-8 rounded-lg border border-white/10 bg-zinc-900 p-5"
      aria-label="Web3 transaction lifecycle state chart"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white">
          Transaction State
        </h2>
        <span className="rounded bg-black px-3 py-1 font-mono text-xs text-green-400">
          {activeState}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {web3TransactionStateOrder.map((node) => {
          const isActive = node === activeState;
          const isFailure = node === 'failed';
          return (
            <div
              key={node}
              className={`rounded border px-3 py-2 text-xs font-bold ${
                isActive
                  ? isFailure
                    ? 'border-red-400 bg-red-500/15 text-red-200'
                    : 'border-green-400 bg-green-500/15 text-green-200'
                  : 'border-white/10 bg-black text-gray-500'
              }`}
            >
              {labels[node]}
            </div>
          );
        })}
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">Wallet</dt>
          <dd className="mt-1 font-mono text-gray-200">{context.walletName ?? 'none'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Network</dt>
          <dd className="mt-1 font-mono text-gray-200">{context.network}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-gray-500">Public key</dt>
          <dd className="mt-1 break-all font-mono text-gray-200">{context.publicKey ?? 'none'}</dd>
        </div>
        {context.error ? (
          <div className="sm:col-span-2">
            <dt className="text-red-300">Error</dt>
            <dd className="mt-1 text-red-200">{context.error}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
