'use client';

import { Frame } from '@/hooks/useDebugger';

interface CallStackViewProps {
  frames: Frame[];
  currentStep: number;
}

export default function CallStackView({ frames, currentStep }: CallStackViewProps) {
  if (frames.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center text-[#4a5568]">
        <svg
          className="mb-2 h-8 w-8 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
          />
        </svg>
        <span className="font-mono text-xs">No active frames</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 font-mono text-xs">
      {[...frames].reverse().map((frame, i) => {
        const isTop = i === 0;
        return (
          <div
            key={frame.id}
            className={[
              'rounded-lg border px-3 py-2.5 transition-all duration-200',
              isTop
                ? 'border-[#00d4aa]/40 bg-[#00d4aa]/5 shadow-[0_0_12px_rgba(0,212,170,0.08)]'
                : 'border-[#2a3a4a] bg-[#0d1b2a]/60',
            ].join(' ')}
            style={{ marginLeft: `${(frames.length - 1 - i) * 8}px` }}
          >
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isTop && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00d4aa]" />}
                <span className={isTop ? 'text-[#00d4aa]' : 'text-[#7ecfb3]'}>
                  {frame.functionName}
                </span>
                <span className="text-[#4a6070]">()</span>
              </div>
              <span className="text-[10px] text-[#4a6070]">
                ⛽ {frame.gasUsed.toLocaleString()}
              </span>
            </div>

            <div className="mb-1.5 truncate text-[10px] text-[#3a5a6a]">{frame.contractId}</div>

            {Object.keys(frame.parameters).length > 0 && (
              <div className="space-y-0.5">
                {Object.entries(frame.parameters).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="min-w-[80px] text-[#5a7a8a]">{k}:</span>
                    <span className="truncate text-[#a0c4b8]">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-1.5 text-[10px] text-[#3a5570]">→ {frame.returnType}</div>
          </div>
        );
      })}

      <div className="pt-1 pl-1 text-[10px] text-[#3a5570]">
        depth: {frames.length} · step: {currentStep}
      </div>
    </div>
  );
}
