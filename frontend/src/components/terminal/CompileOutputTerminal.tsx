'use client';

import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';

export type CompileLogLevel = 'info' | 'success' | 'error';

export interface CompileLogEntry {
  id: string;
  level: CompileLogLevel;
  message: string;
  timestamp: string;
}

interface CompileOutputTerminalProps {
  logs: CompileLogEntry[];
  isCompiling?: boolean;
}

export function CompileOutputTerminal({ logs, isCompiling = false }: CompileOutputTerminalProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [logs, isCompiling]);

  return (
    <div className="group relative flex min-h-[280px] flex-grow flex-col overflow-hidden rounded-3xl border border-white/10 bg-black shadow-inner">
      <div className="absolute top-0 left-0 h-1 w-full bg-red-600/30" />
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h3 className="text-[10px] font-black tracking-widest text-gray-500 uppercase">
          Compile_Output
        </h3>
        <span className="text-[9px] font-bold tracking-widest text-zinc-600 uppercase">
          {isCompiling ? 'Running' : 'Ready'}
        </span>
      </div>
      <div
        ref={viewportRef}
        className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-6"
        role="log"
        aria-live="polite"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-500">
            <p>&gt; Initializing environment...</p>
            <p>&gt; Awaiting input signal...</p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={
                log.level === 'success'
                  ? 'text-emerald-400'
                  : log.level === 'error'
                    ? 'text-red-400'
                    : 'text-zinc-300'
              }
            >
              <span className="mr-2 text-zinc-600">[{log.timestamp}]</span>
              <span className="mr-2 inline-flex align-middle">
                {log.level === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : log.level === 'error' ? (
                  <CircleAlert className="h-3.5 w-3.5" />
                ) : (
                  '$'
                )}
              </span>
              <span className="whitespace-pre-wrap">{log.message}</span>
            </div>
          ))
        )}
      </div>
      {isCompiling && (
        <div className="border-t border-white/10 px-5 py-3">
          <div className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-1/2 animate-[loading_1s_infinite] bg-red-600" />
          </div>
        </div>
      )}
    </div>
  );
}
