import React, { useState } from 'react';
import { Briefcase, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';

export default function FreelanceDashboard() {
  const [milestones] = useState([
    { id: 0, desc: 'Initial Research', amount: 200, status: 'Completed' },
    { id: 1, desc: 'Smart Contract Dev', amount: 500, status: 'In Progress' },
    { id: 2, desc: 'Frontend Integration', amount: 300, status: 'Pending' },
  ]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-mono dark:bg-slate-950">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex items-center justify-between border-b border-slate-200 pb-6 dark:border-slate-800">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
              <Briefcase className="text-blue-500" /> Freelance Terminal
            </h1>
            <p className="mt-1 text-slate-500">Status: Active Node | Reputation: 4.8/5.0</p>
          </div>
          <div className="text-right">
            <div className="text-xs tracking-widest text-slate-400 uppercase">Total Escrowed</div>
            <div className="text-2xl font-bold text-green-500">1,000 XLM</div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6">
          {milestones.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-500 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {m.status === 'Completed' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{m.desc}</h3>
                    <p className="text-sm text-slate-500">{m.status}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 dark:text-white">{m.amount} XLM</div>
                  <button className="mt-2 rounded bg-slate-900 px-3 py-1 text-xs text-white hover:opacity-80 dark:bg-white dark:text-slate-900">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-10 flex items-center justify-between rounded-xl bg-blue-600 p-6 text-white">
          <div className="flex items-center gap-4">
            <ShieldCheck size={40} />
            <div>
              <h4 className="font-bold">Escrow Protection Active</h4>
              <p className="text-sm text-blue-100">Funds are locked in the Soroban contract #380</p>
            </div>
          </div>
          <button className="rounded-lg bg-white px-6 py-2 font-bold text-blue-600 transition-colors hover:bg-blue-50">
            Withdraw Earnings
          </button>
        </footer>
      </div>
    </div>
  );
}
