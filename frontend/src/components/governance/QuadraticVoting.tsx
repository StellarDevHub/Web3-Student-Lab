"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Vote, 
  Plus, 
  Minus, 
  Info, 
  TrendingUp, 
  CheckCircle2, 
  XCircle,
  History,
  ShieldCheck,
  CreditCard,
  ChevronRight,
  AlertCircle,
  Clock,
  User,
  ArrowRight
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { Slider } from '../ui/Slider';
import { Badge } from '../ui/Badge';
import { Alert } from '../ui/Alert';

interface Proposal {
  id: string;
  title: string;
  description: string;
  tally: number;
  totalCredits: number;
  deadline: string;
  status: 'Active' | 'Passed' | 'Failed' | 'Executed';
  creator: string;
}

const MOCK_PROPOSALS: Proposal[] = [
  {
    id: '1',
    title: 'Upgrade Lab Infrastructure',
    description: 'Proposal to upgrade the local compute cluster to support higher-intensity web3 simulations and student projects.',
    tally: 45,
    totalCredits: 2025,
    deadline: '2026-05-15',
    status: 'Active',
    creator: 'GD...4R2'
  },
  {
    id: '2',
    title: 'Staking Rewards v2',
    description: 'Implementing a tiered staking reward system based on course completion certificates to incentivize learning.',
    tally: 120,
    totalCredits: 14400,
    deadline: '2026-05-20',
    status: 'Active',
    creator: 'GD...7X1'
  },
  {
    id: '3',
    title: 'Community Grant Program',
    description: 'Allocate 50,000 tokens for student-led research initiatives in decentralized identity.',
    tally: -15,
    totalCredits: 225,
    deadline: '2026-04-25',
    status: 'Failed',
    creator: 'GD...2K8'
  }
];

export const QuadraticVoting = () => {
  const [proposals, setProposals] = useState<Proposal[]>(MOCK_PROPOSALS);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [credits, setCredits] = useState(100);
  const [isVerified, setIsVerified] = useState(true);
  const [history, setHistory] = useState<{title: string, votes: number, cost: number}[]>([]);

  const cost = useMemo(() => Math.pow(Math.abs(voteCount), 2), [voteCount]);
  const canAfford = cost <= credits;

  const handleVote = () => {
    if (canAfford && voteCount !== 0 && selectedProposal) {
      setCredits(prev => prev - cost);
      setHistory(prev => [{
        title: selectedProposal.title,
        votes: voteCount,
        cost: cost
      }, ...prev]);
      
      // Update mock tally
      setProposals(prev => prev.map(p => 
        p.id === selectedProposal.id 
          ? { ...p, tally: p.tally + voteCount, totalCredits: p.totalCredits + cost } 
          : p
      ));

      setSelectedProposal(null);
      setVoteCount(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-slate-100 p-8 font-sans selection:bg-indigo-500/30">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                <ShieldCheck size={24} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                Governance Dashboard
              </h1>
            </div>
            <p className="text-slate-400 max-w-md">
              Democracy decentralized. Every voice matters, weighted quadratically for fairness.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <CreditCard size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Voting Credits</p>
                <p className="text-xl font-bold text-white">{credits.toLocaleString()}</p>
              </div>
            </Card>

            <div className={`p-1 rounded-full ${isVerified ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'} border border-current/20 flex items-center gap-2 px-3 py-1.5`}>
              {isVerified ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span className="text-xs font-bold uppercase tracking-tighter">
                {isVerified ? 'Sybil Verified' : 'Unverified'}
              </span>
            </div>
          </div>
        </header>

        {/* Identity Alert */}
        {!isVerified && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Alert variant="warning" className="bg-amber-500/10 border-amber-500/20 text-amber-200">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-amber-400" />
                <div>
                  <p className="font-bold">Identity Verification Required</p>
                  <p className="text-sm opacity-80">You need to link your Student DID to receive voting credits and participate in governance.</p>
                </div>
                <Button variant="outline" className="ml-auto border-amber-500/30 hover:bg-amber-500/20 text-amber-200 text-xs h-8">
                  Verify Now
                </Button>
              </div>
            </Alert>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Proposals */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <TrendingUp size={20} className="text-indigo-400" />
                Active Proposals
              </h2>
              <div className="flex gap-2">
                <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">All</Badge>
                <Badge variant="outline" className="text-slate-500 border-slate-800">Recent</Badge>
              </div>
            </div>

            <div className="space-y-4">
              {proposals.map((proposal) => (
                <motion.div
                  key={proposal.id}
                  whileHover={{ y: -2 }}
                  layoutId={proposal.id}
                >
                  <Card className="group relative overflow-hidden bg-slate-900/40 border-slate-800 hover:border-indigo-500/50 transition-all duration-300 backdrop-blur-md">
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <Badge className={`${
                            proposal.status === 'Active' ? 'bg-indigo-500/10 text-indigo-400' : 
                            proposal.status === 'Passed' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          } border-none mb-3`}>
                            {proposal.status}
                          </Badge>
                          <h3 className="text-xl font-bold group-hover:text-indigo-400 transition-colors">{proposal.title}</h3>
                        </div>
                        <div className="flex flex-col items-end text-slate-500">
                          <div className="flex items-center gap-1 text-xs font-mono">
                            <Clock size={12} />
                            Ends {proposal.deadline}
                          </div>
                        </div>
                      </div>

                      <p className="text-slate-400 text-sm mb-6 line-clamp-2">
                        {proposal.description}
                      </p>

                      <div className="space-y-4">
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-500 uppercase tracking-widest">Community Tally</span>
                          <span className="text-indigo-400 font-mono text-sm">{proposal.tally > 0 ? '+' : ''}{proposal.tally} Votes</span>
                        </div>
                        <Progress 
                          value={Math.min(100, Math.max(0, (proposal.tally + 50)))} 
                          className="h-2 bg-slate-800"
                        />
                        <div className="flex justify-between text-[10px] text-slate-600 font-mono italic">
                          <span>Opposition</span>
                          <span>Support</span>
                        </div>
                      </div>

                      <div className="mt-8 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-500 text-xs">
                          <User size={14} />
                          <span>By {proposal.creator}</span>
                        </div>
                        <Button 
                          onClick={() => setSelectedProposal(proposal)}
                          disabled={proposal.status !== 'Active'}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-6 gap-2 group/btn"
                        >
                          {proposal.status === 'Active' ? 'Cast Vote' : 'View Results'}
                          <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Sidebar: History & Stats */}
          <div className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800 p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <History size={18} className="text-indigo-400" />
                Your Voting History
              </h3>
              
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 italic text-sm">
                    No votes cast yet.
                  </div>
                ) : (
                  history.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 flex flex-col gap-1">
                      <p className="text-sm font-bold truncate">{item.title}</p>
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span className={item.votes > 0 ? 'text-green-400' : 'text-red-400'}>
                          {item.votes > 0 ? '+' : ''}{item.votes} votes
                        </span>
                        <span className="font-mono">{item.cost} credits spent</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-indigo-500/20 p-6 overflow-hidden relative">
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl" />
              <h3 className="text-lg font-bold mb-2">Quadratic Voting 101</h3>
              <p className="text-sm text-slate-300 leading-relaxed opacity-80">
                To cast <span className="font-bold text-white">N</span> votes, it costs <span className="font-bold text-white text-lg">N²</span> credits. This prevents "whales" from dominating, as each additional vote becomes increasingly expensive.
              </p>
              <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3">
                <div className="p-2 bg-indigo-500/30 rounded-lg">
                  <Info size={16} className="text-indigo-300" />
                </div>
                <p className="text-xs text-slate-400 italic">Example: 10 votes = 100 credits</p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Voting Modal */}
      <AnimatePresence>
        {selectedProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProposal(null)}
              className="absolute inset-0 bg-[#05070a]/90 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg relative z-10"
            >
              <Card className="bg-slate-900 border-slate-700 shadow-2xl overflow-hidden">
                <div className="p-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
                <div className="p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{selectedProposal.title}</h2>
                      <p className="text-slate-500 text-sm flex items-center gap-1">
                        <CreditCard size={14} />
                        Available: {credits} credits
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      onClick={() => setSelectedProposal(null)}
                      className="p-1 h-auto text-slate-500 hover:text-white hover:bg-slate-800"
                    >
                      <XCircle size={24} />
                    </Button>
                  </div>

                  <div className="space-y-8 py-4">
                    <div className="text-center">
                      <div className="text-6xl font-black mb-2 flex items-center justify-center gap-4">
                        <span className={voteCount > 0 ? 'text-green-500' : voteCount < 0 ? 'text-red-500' : 'text-slate-600'}>
                          {voteCount > 0 ? '+' : ''}{voteCount}
                        </span>
                        <div className="text-xl font-bold text-slate-500 uppercase tracking-[0.2em]">Votes</div>
                      </div>
                      <p className="text-slate-400 text-sm">Use the slider to adjust your impact</p>
                    </div>

                    <div className="px-4">
                      <Slider
                        min={-10}
                        max={10}
                        step={1}
                        value={[voteCount]}
                        onValueChange={(val) => setVoteCount(val[0])}
                        className="py-4"
                      />
                      <div className="flex justify-between text-xs font-mono text-slate-600">
                        <span>OPPOSE (-10)</span>
                        <span>NEUTRAL</span>
                        <span>SUPPORT (+10)</span>
                      </div>
                    </div>

                    <Card className={`p-6 border-none transition-all duration-300 ${
                      canAfford ? 'bg-indigo-500/10' : 'bg-red-500/10'
                    }`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-2xl ${canAfford ? 'bg-indigo-500/20 text-indigo-400' : 'bg-red-500/20 text-red-400'}`}>
                            <CreditCard size={24} />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Total Cost</p>
                            <p className={`text-2xl font-black ${canAfford ? 'text-white' : 'text-red-400'}`}>
                              {cost} Credits
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Formula</p>
                          <p className="text-lg font-mono italic text-indigo-400/60">abs({voteCount})²</p>
                        </div>
                      </div>
                    </Card>

                    {!canAfford && (
                      <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                        <AlertCircle size={16} />
                        <span>Insufficient credits. Reduce votes to continue.</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setSelectedProposal(null)}
                      className="border-slate-800 text-slate-400 hover:bg-slate-800 py-6"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleVote}
                      disabled={!canAfford || voteCount === 0}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-6 gap-2"
                    >
                      Confirm Votes
                      <ArrowRight size={18} />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </div>
  );
};
