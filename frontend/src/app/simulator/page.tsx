'use client';

import { useEffect, useState } from 'react';

interface Transaction {
  id: string;
  source: string;
  op: string;
  amount?: string;
  asset?: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  time: string;
}

interface Ledger {
  sequence: number;
  txCount: number;
  hash: string;
  time: string;
}

export default function SimulatorPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLive, setIsLive] = useState(true);

  // Generate fake live data
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      // 10% chance of a new ledger
      if (Math.random() > 0.9) {
        const newLedger: Ledger = {
          sequence: (ledgers[0]?.sequence || 524000) + 1,
          txCount: Math.floor(Math.random() * 15) + 1,
          hash: Math.random().toString(16).substring(2, 10).toUpperCase() + '...',
          time: new Date().toLocaleTimeString(),
        };
        setLedgers((prev) => [newLedger, ...prev].slice(0, 10));

        // Generate transactions for this ledger
        for (let i = 0; i < newLedger.txCount; i++) {
          const ops = [
            'PAYMENT',
            'MANAGE_OFFER',
            'CHANGE_TRUST',
            'INVOKE_HOST_FUNCTION',
            'CREATE_ACCOUNT',
          ];
          const assets = ['XLM', 'USDC', 'EURC', 'AQUA'];
          const newTx: Transaction = {
            id: Math.random().toString(36).substring(2, 9).toUpperCase(),
            source: 'G' + Math.random().toString(36).substring(2, 12).toUpperCase() + '...',
            op: ops[Math.floor(Math.random() * ops.length)],
            amount: (Math.random() * 1000).toFixed(2),
            asset: assets[Math.floor(Math.random() * assets.length)],
            status: Math.random() > 0.05 ? 'SUCCESS' : 'FAILED',
            time: new Date().toLocaleTimeString(),
          };
          setTransactions((prev) => [newTx, ...prev].slice(0, 50));
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [ledgers, isLive]);

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-black p-6 font-mono text-white md:p-12">
      {/* Background Grid Accent */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col">
        {/* Header */}
        <div className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="border-l-4 border-red-600 pl-6">
            <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
              Network <span className="text-red-500">Simulator</span>
            </h1>
            <p className="text-xs tracking-[0.3em] text-gray-500 uppercase">
              Real-time Stellar Ledger Observer [v4.2.0]
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded border border-white/10 bg-zinc-900 px-4 py-2">
              <div
                className={`h-2 w-2 rounded-full ${isLive ? 'animate-pulse bg-green-500' : 'bg-red-500'}`}
              ></div>
              <span className="text-[10px] font-bold tracking-widest uppercase">
                {isLive ? 'Live Feed' : 'Paused'}
              </span>
            </div>
            <button
              onClick={() => setIsLive(!isLive)}
              className="bg-white px-4 py-2 text-[10px] font-black tracking-widest text-black uppercase transition-colors hover:bg-gray-200"
            >
              {isLive ? 'Stop Sync' : 'Start Sync'}
            </button>
          </div>
        </div>

        <div className="grid flex-grow grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Recent Ledgers */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl lg:col-span-1">
            <h3 className="mb-6 flex items-center justify-between border-b border-white/10 pb-4 text-sm font-bold tracking-widest uppercase">
              Ledger Chain
              <span className="text-[10px] font-normal text-gray-600">History [10]</span>
            </h3>
            <div className="custom-scrollbar space-y-4 overflow-y-auto pr-2">
              {ledgers.length === 0 && (
                <p className="text-xs text-gray-700 italic">Awaiting first ledger pulse...</p>
              )}
              {ledgers.map((l) => (
                <div
                  key={l.sequence}
                  className="group rounded-r border-t border-r border-b border-l-2 border-red-600 border-white/5 bg-black p-4 transition-colors hover:border-red-500/50"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-black text-red-500">#{l.sequence}</span>
                    <span className="text-[10px] text-gray-500">{l.time}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-400">
                      TXS: <span className="text-white italic">{l.txCount}</span>
                    </span>
                    <span className="font-mono text-gray-600">{l.hash}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Transaction Stream */}
          <div className="flex min-h-[500px] flex-col rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl lg:col-span-2">
            <h3 className="mb-6 flex items-center justify-between border-b border-white/10 pb-4 text-sm font-bold tracking-widest uppercase">
              Transaction Stream
              <span className="text-[10px] font-normal text-gray-600">Active Memory [50]</span>
            </h3>
            <div className="flex-grow overflow-x-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-white/5 tracking-widest text-gray-600 uppercase">
                    <th className="pb-3 font-normal">Hash</th>
                    <th className="pb-3 font-normal">Operation</th>
                    <th className="pb-3 font-normal">Asset/Amt</th>
                    <th className="pb-3 font-normal">Account</th>
                    <th className="pb-3 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="group transition-colors hover:bg-white/5">
                      <td className="py-3 font-bold tracking-tighter text-red-500">{tx.id}</td>
                      <td className="py-3 font-bold text-gray-300">{tx.op}</td>
                      <td className="py-3 font-mono">
                        {tx.amount} <span className="text-gray-600">{tx.asset}</span>
                      </td>
                      <td className="py-3 text-[10px] text-gray-500">{tx.source}</td>
                      <td className="py-3 text-right">
                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-black ${
                            tx.status === 'SUCCESS'
                              ? 'border border-green-500/30 bg-green-500/10 text-green-500'
                              : 'border border-red-500/30 bg-red-500/10 text-red-500'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-gray-700 italic">
                        No incoming packets detected. Sync with global nodes to start data
                        reception.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ef4444;
        }
      `}</style>
    </div>
  );
}
