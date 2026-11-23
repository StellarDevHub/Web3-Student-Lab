'use client';

import { useState } from 'react';
import { WatchExpression } from '@/hooks/useDebugger';

interface StateInspectorProps {
  localVariables: Map<string, unknown>;
  contractStorage: Map<string, unknown>;
  watchExpressions: WatchExpression[];
  onAddWatch: (expr: string) => void;
  onRemoveWatch: (id: string) => void;
}

type Tab = 'locals' | 'storage' | 'watch';

function ValueBadge({ value }: { value: unknown }) {
  const type = typeof value;
  const color =
    type === 'number'
      ? 'text-[#f9c74f]'
      : type === 'boolean'
        ? value
          ? 'text-[#00d4aa]'
          : 'text-[#f94144]'
        : type === 'string'
          ? 'text-[#a8d8ea]'
          : 'text-[#c9b1ff]';

  const display = type === 'object' ? JSON.stringify(value) : String(value);

  return <span className={`font-mono text-xs ${color} max-w-[160px] truncate`}>{display}</span>;
}

function TypeTag({ value }: { value: unknown }) {
  const type =
    typeof value === 'object'
      ? 'object'
      : typeof value === 'number'
        ? Number.isInteger(value as number)
          ? 'i128'
          : 'f64'
        : typeof value === 'boolean'
          ? 'bool'
          : 'String';

  const bg =
    type === 'i128' || type === 'f64'
      ? 'bg-[#f9c74f]/10 text-[#f9c74f]'
      : type === 'bool'
        ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
        : type === 'String'
          ? 'bg-[#a8d8ea]/10 text-[#a8d8ea]'
          : 'bg-[#c9b1ff]/10 text-[#c9b1ff]';

  return <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${bg}`}>{type}</span>;
}

export default function StateInspector({
  localVariables,
  contractStorage,
  watchExpressions,
  onAddWatch,
  onRemoveWatch,
}: StateInspectorProps) {
  const [tab, setTab] = useState<Tab>('locals');
  const [watchInput, setWatchInput] = useState('');

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'locals', label: 'Locals', count: localVariables.size },
    { id: 'storage', label: 'Storage', count: contractStorage.size },
    { id: 'watch', label: 'Watch', count: watchExpressions.length },
  ];

  function handleAddWatch() {
    if (watchInput.trim()) {
      onAddWatch(watchInput.trim());
      setWatchInput('');
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="mb-3 flex border-b border-[#1a2e3a]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-mono text-xs transition-colors',
              tab === t.id
                ? 'border-[#00d4aa] text-[#00d4aa]'
                : 'border-transparent text-[#4a6070] hover:text-[#7ecfb3]',
            ].join(' ')}
          >
            {t.label}
            <span
              className={[
                'rounded px-1 text-[9px]',
                tab === t.id ? 'bg-[#00d4aa]/15' : 'bg-[#1a2e3a]',
              ].join(' ')}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {tab === 'locals' && (
          <>
            {localVariables.size === 0 ? (
              <p className="py-6 text-center font-mono text-xs text-[#4a5568]">
                No local variables
              </p>
            ) : (
              Array.from(localVariables.entries()).map(([key, value]) => (
                <div
                  key={key}
                  className="group flex items-center justify-between rounded-lg border border-[#1a2e3a] bg-[#0d1b2a]/60 px-2.5 py-1.5 transition-colors hover:border-[#2a3e4a]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <TypeTag value={value} />
                    <span className="truncate font-mono text-xs text-[#7ecfb3]">{key}</span>
                  </div>
                  <ValueBadge value={value} />
                </div>
              ))
            )}
          </>
        )}

        {tab === 'storage' && (
          <>
            {contractStorage.size === 0 ? (
              <p className="py-6 text-center font-mono text-xs text-[#4a5568]">Storage empty</p>
            ) : (
              Array.from(contractStorage.entries()).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-lg border border-[#1a2e3a] bg-[#0d1b2a]/60 px-2.5 py-2 transition-colors hover:border-[#2a3e4a]"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-[#f9c74f]" />
                    <span className="truncate font-mono text-[10px] text-[#a8d8ea]">{key}</span>
                  </div>
                  <div className="pl-3">
                    <ValueBadge value={value} />
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'watch' && (
          <>
            <div className="mb-3 flex gap-2">
              <input
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWatch()}
                placeholder="Add expression…"
                className="flex-1 rounded-lg border border-[#1a2e3a] bg-[#0d1b2a] px-3 py-1.5 font-mono text-xs text-[#a0c4b8] placeholder-[#3a5570] focus:border-[#00d4aa]/50 focus:outline-none"
              />
              <button
                onClick={handleAddWatch}
                className="rounded-lg border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-3 py-1.5 text-xs text-[#00d4aa] transition-colors hover:bg-[#00d4aa]/20"
              >
                +
              </button>
            </div>

            {watchExpressions.length === 0 ? (
              <p className="py-4 text-center font-mono text-xs text-[#4a5568]">
                No watch expressions
              </p>
            ) : (
              watchExpressions.map((w) => (
                <div
                  key={w.id}
                  className="group flex items-center justify-between rounded-lg border border-[#1a2e3a] bg-[#0d1b2a]/60 px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-xs text-[#c9b1ff]">
                      {w.expression}
                    </span>
                    <span className="text-xs text-[#4a6070]">→</span>
                    {w.error ? (
                      <span className="font-mono text-xs text-[#f94144]">{w.error}</span>
                    ) : (
                      <ValueBadge value={w.value} />
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveWatch(w.id)}
                    className="ml-2 text-xs text-[#f94144]/60 opacity-0 transition-all group-hover:opacity-100 hover:text-[#f94144]"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
