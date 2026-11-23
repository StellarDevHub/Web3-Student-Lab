import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Clock,
  Activity,
  ListFilter,
} from 'lucide-react';
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
    <div className="relative flex w-full flex-col border-t border-white/5 bg-[#09090b]/90 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Clock className="h-4 w-4 animate-[pulse_2s_infinite] text-red-500" />
              <div className="absolute inset-0 rounded-full bg-red-500/20 blur-lg" />
            </div>
            <span className="text-[11px] font-black tracking-[0.2em] text-gray-400 uppercase">
              Temporal Engine
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold tracking-tight text-gray-500 uppercase">
            <Activity className="h-3 w-3 text-emerald-500" />
            State: {currentIndex + 1} / {snapshots.length}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-black/40 p-1 shadow-inner">
            <button
              onClick={() => handleSelect(Math.max(0, currentIndex - 1))}
              className="rounded-lg p-2 text-gray-500 transition-all hover:bg-white/5 hover:text-white active:scale-90"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={togglePlay}
              className="rounded-lg bg-red-500 p-2.5 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all hover:bg-red-400 active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              )}
            </button>
            <button
              onClick={() => handleSelect(Math.min(snapshots.length - 1, currentIndex + 1))}
              className="rounded-lg p-2 text-gray-500 transition-all hover:bg-white/5 hover:text-white active:scale-90"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-6 w-px bg-white/10" />

          <button
            onClick={() => handleSelect(snapshots.length - 1)}
            className="group rounded-xl p-2 text-gray-500 transition-all hover:bg-white/5 hover:text-white"
            title="Reset to latest"
          >
            <RotateCcw className="h-4 w-4 transition-transform duration-500 group-active:rotate-[-180deg]" />
          </button>

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'rounded-xl p-2 transition-all',
              showHistory
                ? 'bg-red-500/10 text-red-500'
                : 'text-gray-500 hover:bg-white/5 hover:text-white'
            )}
          >
            <ListFilter className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Timeline snapshots={snapshots} currentIndex={currentIndex} onSelect={handleSelect} />

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute right-6 bottom-full z-[100] mb-4 w-64 rounded-2xl border border-white/10 bg-gray-900/95 p-4 shadow-2xl backdrop-blur-xl"
          >
            <h4 className="mb-3 border-b border-white/5 pb-2 text-[10px] font-black tracking-widest text-gray-500 uppercase">
              History Log
            </h4>
            <div className="no-scrollbar max-h-60 space-y-2 overflow-y-auto">
              {snapshots
                .slice()
                .reverse()
                .map((s, i) => (
                  <div
                    key={s.id}
                    className={cn(
                      'cursor-pointer rounded-lg border border-transparent p-2 text-xs transition-all',
                      snapshots.length - 1 - i === currentIndex
                        ? 'border-red-500/20 bg-red-500/10 text-white'
                        : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                    )}
                    onClick={() => handleSelect(snapshots.length - 1 - i)}
                  >
                    <div className="font-bold">{s.description}</div>
                    <div className="font-mono text-[9px] tracking-tighter opacity-60">
                      {new Date(s.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
