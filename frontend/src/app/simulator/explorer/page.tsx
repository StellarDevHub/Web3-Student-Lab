import { BlockchainExplorer } from '@/components/simulator/BlockchainExplorer';

/**
 * Blockchain Explorer Page — /simulator/explorer
 *
 * Educational view: shows students how blockchain explorers work by streaming
 * simulated Stellar transactions in real-time.
 */
export default function BlockchainExplorerPage() {
  return (
    <main
      className="min-h-[calc(100vh-80px)] bg-black p-6 md:p-12"
      aria-label="Blockchain Explorer"
    >
      {/* Background grid */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative mx-auto max-w-7xl">
        {/* Page heading */}
        <div className="mb-8 border-l-4 border-red-600 pl-6">
          <h1 className="mb-2 font-mono text-4xl font-black uppercase tracking-tighter text-white">
            Blockchain <span className="text-red-500">Explorer</span>
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gray-500">
            Real-time Transaction Monitor · Stellar Testnet Simulator
          </p>
        </div>

        {/* Educational callout */}
        <div className="mb-8 rounded-lg border border-red-600/20 bg-red-500/5 px-5 py-4 font-mono text-xs text-gray-400">
          <strong className="text-red-400">📚 Educational Note:</strong> Blockchain explorers index
          every transaction on-chain and expose it through a searchable UI. Each row below
          represents a Stellar operation — PAYMENT, MANAGE_OFFER, INVOKE_HOST_FUNCTION, etc. Click
          any row to expand full transaction details.
        </div>

        <BlockchainExplorer maxTransactions={100} />
      </div>
    </main>
  );
}
