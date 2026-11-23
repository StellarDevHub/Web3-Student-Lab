'use client';

interface BreakpointManagerProps {
  breakpoints: Set<number>;
  totalLines: number;
  onToggle: (line: number) => void;
  onClearAll: () => void;
  currentLine?: number;
}

export default function BreakpointManager({
  breakpoints,
  totalLines,
  onToggle,
  onClearAll,
  currentLine,
}: BreakpointManagerProps) {
  const sorted = Array.from(breakpoints).sort((a, b) => a - b);

  return (
    <div className="flex h-full flex-col">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-widest text-[#4a6070] uppercase">
          Breakpoints ({breakpoints.size})
        </span>
        {breakpoints.size > 0 && (
          <button
            onClick={onClearAll}
            className="font-mono text-[10px] text-[#f94144]/60 transition-colors hover:text-[#f94144]"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Quick-add by line number */}
      <div className="mb-3 flex gap-2">
        <input
          type="number"
          min={1}
          max={totalLines}
          placeholder="Line #"
          className="flex-1 [appearance:textfield] rounded-lg border border-[#1a2e3a] bg-[#0d1b2a] px-3 py-1.5 font-mono text-xs text-[#a0c4b8] placeholder-[#3a5570] focus:border-[#f94144]/50 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = parseInt((e.target as HTMLInputElement).value);
              if (!isNaN(val) && val >= 1) {
                onToggle(val);
                (e.target as HTMLInputElement).value = '';
              }
            }
          }}
        />
        <span className="flex items-center pr-1 font-mono text-[10px] text-[#3a5570]">↵ add</span>
      </div>

      {/* Breakpoint list */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center text-[#4a5568]">
            <span className="mb-1 text-2xl">⬤</span>
            <span className="font-mono text-xs">No breakpoints set</span>
            <span className="mt-1 text-[10px] text-[#3a5570]">
              Click line numbers or use the input above
            </span>
          </div>
        ) : (
          sorted.map((line) => {
            const isActive = line === currentLine;
            return (
              <div
                key={line}
                className={[
                  'flex items-center justify-between rounded-lg border px-3 py-2 transition-all duration-150',
                  isActive
                    ? 'border-[#f9c74f]/40 bg-[#f9c74f]/5'
                    : 'border-[#1a2e3a] bg-[#0d1b2a]/60 hover:border-[#f94144]/30',
                ].join(' ')}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      'h-2.5 w-2.5 flex-shrink-0 rounded-full',
                      isActive ? 'bg-[#f9c74f]' : 'bg-[#f94144]',
                    ].join(' ')}
                  />
                  <div>
                    <span className="font-mono text-xs text-[#a0c4b8]">Line {line}</span>
                    {isActive && (
                      <span className="ml-2 rounded bg-[#f9c74f]/10 px-1.5 py-0.5 font-mono text-[9px] text-[#f9c74f]">
                        PAUSED HERE
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onToggle(line)}
                  className="text-xs text-[#f94144]/40 transition-colors hover:text-[#f94144]"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Hint */}
      <div className="mt-3 border-t border-[#1a2e3a] pt-3">
        <p className="font-mono text-[10px] leading-relaxed text-[#3a5570]">
          Execution pauses when it reaches a breakpoint line. Use{' '}
          <span className="text-[#00d4aa]">▶ Play</span> to run until next breakpoint.
        </p>
      </div>
    </div>
  );
}
