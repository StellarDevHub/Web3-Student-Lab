import React, { useState } from 'react';
import { Briefcase, CheckCircle2, Clock, Star, DollarSign, ShieldCheck } from 'lucide-react';

export default function FreelanceDashboard() {
    const [milestones, setMilestones] = useState([
        { id: 0, desc: 'Initial Research', amount: 200, status: 'Completed' },
        { id: 1, desc: 'Smart Contract Dev', amount: 500, status: 'In Progress' },
        { id: 2, desc: 'Frontend Integration', amount: 300, status: 'Pending' }
    ]);

    return (
        <div className="p-6 bg-slate-50 dark:bg-slate-950 min-h-screen font-mono">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-10 border-b border-slate-200 dark:border-slate-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <Briefcase className="text-blue-500" /> Freelance Terminal
                        </h1>
                        <p className="text-slate-500 mt-1">Status: Active Node | Reputation: 4.8/5.0</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs uppercase tracking-widest text-slate-400">Total Escrowed</div>
                        <div className="text-2xl font-bold text-green-500">1,000 XLM</div>
                    </div>
                </header>

                <div className="grid grid-cols-1 gap-6">
                    {milestones.map((m) => (
                        <div key={m.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-lg shadow-sm hover:border-blue-500 transition-colors">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <div className={p-2 rounded-full }>
                                        {m.status === 'Completed' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">{m.desc}</h3>
                                        <p className="text-sm text-slate-500">{m.status}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-slate-900 dark:text-white">{m.amount} XLM</div>
                                    <button className="mt-2 text-xs bg-slate-900 dark:bg-white dark:text-slate-900 text-white px-3 py-1 rounded hover:opacity-80">
                                        View Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <footer className="mt-10 p-6 bg-blue-600 rounded-xl text-white flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <ShieldCheck size={40} />
                        <div>
                            <h4 className="font-bold">Escrow Protection Active</h4>
                            <p className="text-sm text-blue-100">Funds are locked in the Soroban contract #380</p>
                        </div>
                    </div>
                    <button className="bg-white text-blue-600 px-6 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors">
                        Withdraw Earnings
                    </button>
                </footer>
            </div>
        </div>
    );
}
