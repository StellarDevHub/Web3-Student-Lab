'use client';

import { useState } from 'react';
import IdeaGeneratorPanel from '@/components/idea-generator/IdeaGeneratorPanel';
import { CollaborativeCanvas } from '@/components/CollaborativeCanvas';
import PeerReviewDashboard from '@/components/review/PeerReviewDashboard';
import { ReputationDashboard } from '@/components/reputation/ReputationDashboard';
import { EncryptedRoomChat } from '@/components/collaboration/EncryptedRoomChat';
import { Users, Lightbulb, PenTool, Star, MessageSquare } from 'lucide-react';

export default function CollaborativeLab() {
  const [activeTab, setActiveTab] = useState('ideas');

  const tabs = [
    { id: 'ideas', label: 'Hackathon Ideas', icon: <Lightbulb className="w-4 h-4" /> },
    { id: 'canvas', label: 'Architecture Canvas', icon: <PenTool className="w-4 h-4" /> },
    { id: 'reviews', label: 'Peer Reviews', icon: <Users className="w-4 h-4" /> },
    { id: 'reputation', label: 'Reputation', icon: <Star className="w-4 h-4" /> },
    { id: 'chat', label: 'Team Chat', icon: <MessageSquare className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background pt-24 px-4 pb-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">
              Collaborative <span className="text-red-500">Lab</span>
            </h1>
            <p className="text-text-secondary">
              Work on hackathons, design architecture, and build your decentralized reputation.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTab === tab.id 
                    ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                    : 'bg-bg-secondary text-text-secondary hover:text-foreground hover:bg-bg-secondary/80 border border-border-theme'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-bg-secondary/30 border border-border-theme rounded-2xl p-6 min-h-[600px]">
          {activeTab === 'ideas' && <IdeaGeneratorPanel />}
          {activeTab === 'canvas' && <CollaborativeCanvas roomId="hackathon-general" />}
          {activeTab === 'reviews' && <PeerReviewDashboard />}
          {activeTab === 'reputation' && <ReputationDashboard />}
          {activeTab === 'chat' && <EncryptedRoomChat roomId="hackathon-general" />}
        </div>
      </div>
    </div>
  );
}
