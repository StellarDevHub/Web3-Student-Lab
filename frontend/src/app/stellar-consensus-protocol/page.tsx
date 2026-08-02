'use client';

import { SCPVisualizer } from '@/components/stellar-scp';

export default function SCPPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-400">
          <a href="/" className="hover:text-slate-200 transition-colors">
            Home
          </a>
          <span>/</span>
          <span>Stellar Consensus Protocol</span>
        </nav>

        {/* Hero Section */}
        <div className="mb-8 border-b border-slate-700 pb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-green-400 mb-4">
            Stellar Consensus Protocol (SCP)
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl">
            Explore how Stellar validators reach consensus through a decentralized Byzantine fault-tolerant
            protocol. This interactive visualizer demonstrates the Nomination and Ballot phases.
          </p>
        </div>

        {/* Visualizer */}
        <div className="mb-8">
          <SCPVisualizer />
        </div>

        {/* Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {/* Phase Explanation */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold text-blue-400 mb-4">🎯 How It Works</h2>
            <div className="space-y-4 text-sm text-slate-300">
              <div>
                <h3 className="font-semibold text-slate-100 mb-2">Nomination Phase</h3>
                <p>
                  Validators broadcast their candidate values. Each validator collects nominations from its
                  quorum set and votes to confirm a composite candidate value that represents the set of all
                  proposed values.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 mb-2">Ballot Phase</h3>
                <p>
                  Validators attempt to reach agreement on a specific value. Each ballot progresses through
                  VOTE → ACCEPT → CONFIRM stages. A value is confirmed when the validator's entire quorum set
                  accepts it.
                </p>
              </div>
            </div>
          </div>

          {/* Features & Controls */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold text-purple-400 mb-4">⚙️ Features</h2>
            <ul className="space-y-3 text-sm text-slate-300">
              <li className="flex gap-3">
                <span className="text-green-400 font-bold">▶</span>
                <span><strong>Start/Pause</strong> - Control simulation flow</span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-400 font-bold">⏭</span>
                <span><strong>Step</strong> - Advance one step for learning</span>
              </li>
              <li className="flex gap-3">
                <span className="text-yellow-400 font-bold">↺</span>
                <span><strong>Reset</strong> - Return to initial state</span>
              </li>
              <li className="flex gap-3">
                <span className="text-amber-400 font-bold">⚡</span>
                <span><strong>Speed Control</strong> - Adjust simulation tempo</span>
              </li>
              <li className="flex gap-3">
                <span className="text-red-400 font-bold">✗</span>
                <span><strong>Click Node</strong> - Simulate validator failure</span>
              </li>
            </ul>
          </div>

          {/* Consensus States */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold text-amber-400 mb-4">🎨 Node States</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-500"></div>
                <span>Idle</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span>Nominating</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span>Voting</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <span>Accepted</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Confirmed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>Failed</span>
              </div>
            </div>
          </div>

          {/* Key Concepts */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold text-green-400 mb-4">📚 Key Concepts</h2>
            <div className="space-y-3 text-xs text-slate-300">
              <div>
                <strong className="text-slate-100">Quorum Set</strong>
                <p>A set of validators each validator trusts to reach agreement</p>
              </div>
              <div>
                <strong className="text-slate-100">Byzantine Fault Tolerance</strong>
                <p>System tolerates some validators being faulty or malicious</p>
              </div>
              <div>
                <strong className="text-slate-100">Consensus</strong>
                <p>All valid validators eventually confirm the same value</p>
              </div>
            </div>
          </div>
        </div>

        {/* Learning Resources */}
        <div className="mt-12 bg-slate-800/50 border border-slate-700 rounded-lg p-6 backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-slate-100 mb-6">📖 Learn More</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <a
              href="https://stellar.org/papers/stellar-consensus-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-2 p-4 bg-slate-700/50 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors group"
            >
              <span className="font-semibold text-blue-400 group-hover:text-blue-300">
                SCP Whitepaper ↗
              </span>
              <span className="text-xs text-slate-400">
                The original research paper detailing the Stellar Consensus Protocol
              </span>
            </a>

            <a
              href="https://developers.stellar.org/learn/concepts/scp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-2 p-4 bg-slate-700/50 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors group"
            >
              <span className="font-semibold text-purple-400 group-hover:text-purple-300">
                Developer Guide ↗
              </span>
              <span className="text-xs text-slate-400">
                Comprehensive guide to understanding SCP for developers
              </span>
            </a>

            <a
              href="https://stellar.org/blog/developers/what-is-the-stellar-consensus-protocol/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-2 p-4 bg-slate-700/50 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors group"
            >
              <span className="font-semibold text-green-400 group-hover:text-green-300">
                Protocol Overview ↗
              </span>
              <span className="text-xs text-slate-400">
                High-level introduction to how Stellar consensus works
              </span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-700 text-center text-xs text-slate-500">
          <p>
            🌐 Stellar Consensus Protocol Visualizer | Part of the Web3 Student Lab
          </p>
        </div>
      </div>
    </div>
  );
}
