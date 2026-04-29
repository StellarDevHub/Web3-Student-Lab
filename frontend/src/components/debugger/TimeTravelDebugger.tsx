import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Clock, Activity, ListFilter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StateSnapshot } from '../../lib/debugger/SnapshotManager';
import { Timeline } from './Timeline';
import { cn } from '../../lib/utils';

interface TimeTravelDebuggerProps {
  snapshots: StateSnapshot[];
  onRestore: (id: string) => void;
}

export const TimeTravelDebugger: React.FC<TimeTravelDebuggerProps> = ({ snapshots, onRestore }) => {
  const [currentIndex, setCurrentIndex] = useState(snapshots.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCurrentIndex(snapshots.length - 1);
  }, [snapshots.length]);

  const handleSelect = (index: number) => {
    setCurrentIndex(index);
    onRestore(snapshots[index].id);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= snapshots.length) {
            setIsPlaying(false);
            return prev;
          }
          onRestore(snapshots[next].id);
          return next;
        });
      }, 300);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, snapshots, onRestore]);

  return (
    <div className="flex flex-col w-full bg-[#09090b]/90 backdrop-blur-2xl border-t border-white/5 relative shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="relative">
                <Clock className="w-4 h-4 text-red-500 animate-[pulse_2s_infinite]" />
                <div className="absolute inset-0 bg-red-500/20 blur-lg rounded-full" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Temporal Engine</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500 bg-white/5 px-3 py-1 rounded-full border border-white/10 font-bold uppercase tracking-tight">
            <Activity className="w-3 h-3 text-emerald-500" />
            State: {currentIndex + 1} / {snapshots.length}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-1 gap-0.5 shadow-inner">
            <button 
              onClick={() => handleSelect(Math.max(0, currentIndex - 1))}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all active:scale-90"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={togglePlay}
              className="p-2.5 bg-red-500 hover:bg-red-400 text-white rounded-lg transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] active:scale-95"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <button 
              onClick={() => handleSelect(Math.min(snapshots.length - 1, currentIndex + 1))}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all active:scale-90"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="w-px h-6 bg-white/10 mx-1" />
          
          <button 
            onClick={() => handleSelect(snapshots.length - 1)}
            className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-all group"
            title="Reset to latest"
          >
            <RotateCcw className="w-4 h-4 group-active:rotate-[-180deg] transition-transform duration-500" />
          </button>
          
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "p-2 rounded-xl transition-all",
              showHistory ? "bg-red-500/10 text-red-500" : "text-gray-500 hover:text-white hover:bg-white/5"
            )}
          >
            <ListFilter className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <Timeline 
        snapshots={snapshots} 
        currentIndex={currentIndex} 
        onSelect={handleSelect} 
      />

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-full right-6 mb-4 w-64 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl z-[100]"
          >
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3 border-b border-white/5 pb-2">History Log</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
              {snapshots.slice().reverse().map((s, i) => (
                <div 
                  key={s.id} 
                  className={cn(
                    "p-2 rounded-lg text-xs cursor-pointer transition-all border border-transparent",
                    snapshots.length - 1 - i === currentIndex ? "bg-red-500/10 text-white border-red-500/20" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                  )}
                  onClick={() => handleSelect(snapshots.length - 1 - i)}
                >
                  <div className="font-bold">{s.description}</div>
                  <div className="text-[9px] opacity-60 font-mono tracking-tighter">{new Date(s.timestamp).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
