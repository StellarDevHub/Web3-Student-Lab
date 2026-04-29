"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Rocket, 
  Target, 
  Calendar, 
  Users, 
  CheckCircle2, 
  Circle, 
  ChevronRight, 
  TrendingUp, 
  ShieldCheck, 
  RefreshCcw,
  PlusCircle,
  Vote
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Milestone {
  description: string;
  amount: number;
  approved: boolean;
  votes_for: number;
  votes_against: number;
}

interface Campaign {
  id: string;
  title: string;
  description: string;
  creator: string;
  goal: number;
  funded: number;
  deadline: string;
  milestones: Milestone[];
  currentMilestone: number;
  status: 'active' | 'completed' | 'failed';
}

const mockCampaigns: Campaign[] = [
  {
    id: '1',
    title: 'Web3 Student Research Lab',
    description: 'Decentralized research infrastructure for students to collaborate on blockchain projects.',
    creator: 'GB...X4Y',
    goal: 50000,
    funded: 32500,
    deadline: '2026-06-30',
    status: 'active',
    currentMilestone: 1,
    milestones: [
      { description: 'Initial Infrastructure Setup', amount: 10000, approved: true, votes_for: 5000, votes_against: 0 },
      { description: 'Community Beta Launch', amount: 15000, approved: false, votes_for: 8000, votes_against: 1200 },
      { description: 'Full Platform Rollout', amount: 25000, approved: false, votes_for: 0, votes_against: 0 },
    ]
  },
  {
    id: '2',
    title: 'Green Tech Innovation Fund',
    description: 'Funding sustainable energy solutions developed by engineering students.',
    creator: 'GA...9A2',
    goal: 100000,
    funded: 15000,
    deadline: '2026-05-15',
    status: 'active',
    currentMilestone: 0,
    milestones: [
      { description: 'Prototype Development', amount: 30000, approved: false, votes_for: 2000, votes_against: 100 },
      { description: 'Field Testing', amount: 40000, approved: false, votes_for: 0, votes_against: 0 },
      { description: 'Mass Production', amount: 30000, approved: false, votes_for: 0, votes_against: 0 },
    ]
  }
];

export default function CrowdfundingDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isContributing, setIsContributing] = useState(false);
  const [contributionAmount, setContributionAmount] = useState('');

  const handleContribute = () => {
    if (!selectedCampaign || !contributionAmount) return;
    
    // In a real app, this would call the Soroban contract
    const amount = parseFloat(contributionAmount);
    const updatedCampaigns = campaigns.map(c => {
      if (c.id === selectedCampaign.id) {
        return { ...c, funded: c.funded + amount };
      }
      return c;
    });
    
    setCampaigns(updatedCampaigns);
    setSelectedCampaign({ ...selectedCampaign, funded: selectedCampaign.funded + amount });
    setIsContributing(false);
    setContributionAmount('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent"
            >
              Decentralized Crowdfunding
            </motion.h1>
            <p className="text-slate-400 mt-2">Transparent funding with milestone-based governance.</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20">
            <PlusCircle size={20} />
            Create Campaign
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Campaign List */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Rocket className="text-blue-400" />
              Active Campaigns
            </h2>
            {campaigns.map((campaign) => (
              <motion.div 
                key={campaign.id}
                whileHover={{ scale: 1.01 }}
                className={cn(
                  "bg-slate-900/50 border border-slate-800 rounded-2xl p-6 cursor-pointer transition-all hover:bg-slate-900",
                  selectedCampaign?.id === campaign.id && "ring-2 ring-blue-500/50 bg-slate-900"
                )}
                onClick={() => setSelectedCampaign(campaign)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">{campaign.title}</h3>
                    <p className="text-slate-400 text-sm mt-1">{campaign.description}</p>
                  </div>
                  <div className="bg-slate-800 px-3 py-1 rounded-full text-xs font-mono text-slate-300">
                    {campaign.creator}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-blue-400 font-bold">{Math.round((campaign.funded / campaign.goal) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(campaign.funded / campaign.goal) * 100}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 to-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Target size={16} className="text-emerald-400" />
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Goal</p>
                        <p className="font-medium">{campaign.goal.toLocaleString()} XLM</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-blue-400" />
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Funded</p>
                        <p className="font-medium">{campaign.funded.toLocaleString()} XLM</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-purple-400" />
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Deadline</p>
                        <p className="font-medium">{campaign.deadline}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Detailed View & Actions */}
          <div className="lg:col-span-1">
            <AnimatePresence mode="wait">
              {selectedCampaign ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sticky top-8"
                >
                  <h3 className="text-xl font-bold mb-6">Campaign Control</h3>
                  
                  <div className="space-y-6">
                    {/* Milestones */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Milestone Progress</h4>
                      <div className="space-y-4">
                        {selectedCampaign.milestones.map((m, idx) => (
                          <div key={idx} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              {m.approved ? (
                                <CheckCircle2 className="text-emerald-500" size={24} />
                              ) : idx === selectedCampaign.currentMilestone ? (
                                <div className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center">
                                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                </div>
                              ) : (
                                <Circle className="text-slate-700" size={24} />
                              )}
                              {idx < selectedCampaign.milestones.length - 1 && (
                                <div className={cn("w-0.5 h-8 my-1", m.approved ? "bg-emerald-500/30" : "bg-slate-800")} />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className={cn("text-sm font-medium", m.approved ? "text-emerald-400" : "text-slate-300")}>
                                {m.description}
                              </p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-xs text-slate-500">{m.amount.toLocaleString()} XLM</p>
                                {!m.approved && idx === selectedCampaign.currentMilestone && (
                                  <div className="flex gap-2">
                                    <button className="text-[10px] bg-slate-800 hover:bg-emerald-900/30 hover:text-emerald-400 px-2 py-0.5 rounded transition-colors flex items-center gap-1">
                                      <Vote size={10} /> Approve
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-6">
                      {!isContributing ? (
                        <button 
                          onClick={() => setIsContributing(true)}
                          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white py-3 rounded-xl font-bold shadow-xl shadow-blue-900/40 transition-all flex items-center justify-center gap-2"
                        >
                          <ShieldCheck size={20} />
                          Contribute Now
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <input 
                            type="number"
                            placeholder="Amount in XLM"
                            value={contributionAmount}
                            onChange={(e) => setContributionAmount(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                          />
                          <div className="flex gap-2">
                            <button 
                              onClick={handleContribute}
                              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-bold transition-all"
                            >
                              Confirm
                            </button>
                            <button 
                              onClick={() => setIsContributing(false)}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg font-bold transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
                      <RefreshCcw className="text-blue-400 shrink-0" size={20} />
                      <p className="text-xs text-blue-300 leading-relaxed">
                        Funds are held in escrow and only released when milestones are approved by a majority of backers. Automatic refunds if the goal is not met.
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-full border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center p-12 text-center text-slate-500">
                  <div className="bg-slate-900 p-4 rounded-full mb-4">
                    <Users size={32} />
                  </div>
                  <p className="font-medium">Select a campaign to see detailed analytics and take part in governance.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
