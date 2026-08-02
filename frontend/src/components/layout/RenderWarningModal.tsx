'use client';

import React, { useState, useEffect } from 'react';
import { Server, X, Info } from 'lucide-react';

export default function RenderWarningModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeenWarning = sessionStorage.getItem('render_warning_seen');
    if (!hasSeenWarning) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    sessionStorage.setItem('render_warning_seen', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div 
        className="absolute inset-0 bg-black/95 backdrop-blur-md" 
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-slate-950 border border-slate-700/50 shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 blur-[60px] pointer-events-none" style={{ background: 'rgba(139, 92, 246, 0.25)' }} />
        
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-2xl" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
              <Server size={28} />
            </div>
            <button 
              onClick={handleClose}
              className="p-2 -mr-2 -mt-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          <h2 className="text-xl font-bold text-white mb-2">Backend Warming Up</h2>
          <div className="space-y-4 text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
            <p>
              Welcome! Please note that our backend infrastructure is currently hosted on <strong className="text-white">Render's free tier</strong>.
            </p>
            <div className="flex gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <Info className="shrink-0 mt-0.5 text-amber-500" size={16} />
              <p className="text-xs leading-relaxed">
                If the application hasn't been used in a while, the backend server may take <strong className="text-amber-500">50-60 seconds</strong> to spin up and respond to your first request.
              </p>
            </div>
            <p>
              Thank you for your patience while the server wakes up!
            </p>
          </div>
          
          <button 
            onClick={handleClose}
            className="mt-6 w-full py-3.5 rounded-xl font-bold tracking-wide transition-all active:scale-[0.98] text-white"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
              boxShadow: '0 0 30px rgba(139, 92, 246, 0.4), 0 4px 15px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.15)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            I Understand, Continue
          </button>
        </div>
      </div>
    </div>
  );
}
