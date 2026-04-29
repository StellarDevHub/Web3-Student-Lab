import React from 'react';
import { StateSnapshot } from '../../lib/debugger/SnapshotManager';
import { cn } from '../../lib/utils';

interface TimelineProps {
  snapshots: StateSnapshot[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ snapshots, currentIndex, onSelect }) => {
  return (
    <div className="relative h-14 flex items-center px-8 bg-black/40 border-t border-white/5 overflow-x-auto no-scrollbar group/timeline shadow-inner">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/5" />
      <div className="flex items-center gap-1 min-w-full relative z-10 py-4">
        {snapshots.map((snapshot, index) => (
          <div
            key={snapshot.id}
            onClick={() => onSelect(index)}
            className="group relative flex-shrink-0 flex flex-col items-center justify-center w-4 h-8 cursor-pointer"
          >
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300 transform",
                index === currentIndex ? "bg-red-500 scale-[2] shadow-[0_0_15px_#ef4444]" : "bg-gray-700 hover:bg-gray-400 group-hover:scale-125",
                index < currentIndex ? "bg-red-500/40" : ""
              )}
            />
            
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover:block z-50 pointer-events-none">
              <div className="bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white whitespace-nowrap shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" />
                    <span className="font-black uppercase tracking-widest text-[9px]">Checkpoint</span>
                </div>
                <div className="font-medium text-gray-200">{snapshot.description}</div>
                <div className="text-[9px] text-gray-500 font-mono mt-1">{new Date(snapshot.timestamp).toLocaleTimeString()}</div>
                
                {/* Triangle pointer */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900/95" />
              </div>
            </div>

            {/* Current Indicator Marker */}
            {index === currentIndex && (
                <div className="absolute top-full mt-2 w-[1px] h-3 bg-red-500/50" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
