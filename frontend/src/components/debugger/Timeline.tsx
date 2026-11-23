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
    <div className="no-scrollbar group/timeline relative flex h-14 items-center overflow-x-auto border-t border-white/5 bg-black/40 px-8 shadow-inner">
      <div className="absolute inset-x-0 top-1/2 h-[1px] -translate-y-1/2 bg-white/5" />
      <div className="relative z-10 flex min-w-full items-center gap-1 py-4">
        {snapshots.map((snapshot, index) => (
          <div
            key={snapshot.id}
            onClick={() => onSelect(index)}
            className="group relative flex h-8 w-4 flex-shrink-0 cursor-pointer flex-col items-center justify-center"
          >
            <div
              className={cn(
                'h-1.5 w-1.5 transform rounded-full transition-all duration-300',
                index === currentIndex
                  ? 'scale-[2] bg-red-500 shadow-[0_0_15px_#ef4444]'
                  : 'bg-gray-700 group-hover:scale-125 hover:bg-gray-400',
                index < currentIndex ? 'bg-red-500/40' : ''
              )}
            />

            {/* Tooltip on hover */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-4 hidden -translate-x-1/2 group-hover:block">
              <div className="animate-in fade-in zoom-in rounded-xl border border-white/10 bg-gray-900/95 px-3 py-2 text-[10px] whitespace-nowrap text-white shadow-2xl backdrop-blur-md duration-200">
                <div className="mb-1 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" />
                  <span className="text-[9px] font-black tracking-widest uppercase">
                    Checkpoint
                  </span>
                </div>
                <div className="font-medium text-gray-200">{snapshot.description}</div>
                <div className="mt-1 font-mono text-[9px] text-gray-500">
                  {new Date(snapshot.timestamp).toLocaleTimeString()}
                </div>

                {/* Triangle pointer */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900/95" />
              </div>
            </div>

            {/* Current Indicator Marker */}
            {index === currentIndex && (
              <div className="absolute top-full mt-2 h-3 w-[1px] bg-red-500/50" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
