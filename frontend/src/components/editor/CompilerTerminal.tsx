'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Terminal as TerminalIcon,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CompileLogLevel = 'info' | 'success' | 'error' | 'warn';

export interface CompileLogEntry {
  id: string;
  level: CompileLogLevel;
  message: string;
  timestamp: string;
  line?: number;
  column?: number;
}

export interface TestSummary {
  passed: number;
  failed: number;
  total?: number;
  durationMs?: number;
}

export interface CompilerTerminalProps {
  logs?: CompileLogEntry[];
  isCompiling?: boolean;
  compilationStatus?: 'idle' | 'compiling' | 'success' | 'error';
  testResults?: TestSummary;
  className?: string;
  onJumpToLine?: (line: number, column?: number) => void;
  title?: string;
  terminalId?: string;
}

/**
 * Extracts line and column metadata from error log messages if available.
 * Common formats:
 * - src/contract.rs:18:5
 * - line 18, col 5
 * - --> src/lib.rs:24:9
 */
export function extractLineColumn(message: string): { line?: number; column?: number } {
  const fileLineColMatch = message.match(/(?:-->\s*|:\s*)(?:[\w./\\]+):(\d+):(\d+)/i);
  if (fileLineColMatch && fileLineColMatch[1] && fileLineColMatch[2]) {
    return {
      line: parseInt(fileLineColMatch[1], 10),
      column: parseInt(fileLineColMatch[2], 10),
    };
  }

  const lineColMatch = message.match(/line\s+(\d+)(?:,\s*(?:col|column)\s+(\d+))?/i);
  if (lineColMatch && lineColMatch[1]) {
    return {
      line: parseInt(lineColMatch[1], 10),
      column: lineColMatch[2] ? parseInt(lineColMatch[2], 10) : undefined,
    };
  }

  return {};
}

/**
 * Accessible ARIA 1.2 Live Regions Streaming Compiler Terminal (FE-078).
 *
 * Implements:
 * 1. ARIA 1.2 streaming live region with `aria-live="polite"` and `aria-atomic="false"` for terminal output.
 * 2. Dedicated screen reader polite announcer (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`)
 *    broadcasting compilation status, test pass/fail counts, and error summaries without requiring focus shifts.
 * 3. Accessible keyboard navigation (Alt+E / Alt+Shift+E / F4 / buttons) to cycle through error lines.
 */
export function CompilerTerminal({
  logs = [],
  isCompiling = false,
  compilationStatus,
  testResults,
  className,
  onJumpToLine,
  title = 'Compiler & WASM Execution Terminal',
  terminalId = 'compiler-terminal',
}: CompilerTerminalProps) {
  const generatedId = useId();
  const idPrefix = terminalId || generatedId;
  const viewportRef = useRef<HTMLDivElement>(null);
  const errorRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Screen reader announcement message state
  const [announcement, setAnnouncement] = useState<string>('');
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);

  // Derive all error log entries
  const errorLogs = useMemo(() => {
    return logs.filter((log) => log.level === 'error');
  }, [logs]);

  // Track previous compiling state and log count to broadcast meaningful status transitions
  const prevCompilingRef = useRef<boolean>(isCompiling);
  const prevLogsCountRef = useRef<number>(logs.length);
  const prevTestResultsRef = useRef<TestSummary | undefined>(undefined);

  // Determine current overall compilation status
  const currentStatus = useMemo(() => {
    if (compilationStatus) return compilationStatus;
    if (isCompiling) return 'compiling';
    if (errorLogs.length > 0) return 'error';
    if (logs.some((l) => l.level === 'success')) return 'success';
    return 'idle';
  }, [compilationStatus, isCompiling, errorLogs.length, logs]);

  // Handle status and log announcements for assistive technology
  useEffect(() => {
    const wasCompiling = prevCompilingRef.current;
    prevCompilingRef.current = isCompiling;

    const hadNewLogs = logs.length > prevLogsCountRef.current;
    const newLogs = hadNewLogs ? logs.slice(prevLogsCountRef.current) : [];
    prevLogsCountRef.current = logs.length;

    // Automatically scroll viewport to bottom on new logs
    if (hadNewLogs && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }

    // 1. Transition: Started compiling
    if (!wasCompiling && isCompiling) {
      setAnnouncement('Compilation and WASM execution started. Streaming terminal output...');
      return;
    }

    // 2. Transition: Finished compiling
    if (wasCompiling && !isCompiling) {
      if (errorLogs.length > 0) {
        setAnnouncement(
          `Compilation failed with ${errorLogs.length} ${
            errorLogs.length === 1 ? 'error' : 'errors'
          }. Use Alt+E to navigate between error lines.`
        );
      } else if (logs.some((l) => l.level === 'success')) {
        setAnnouncement('Compilation and WASM execution succeeded. Contract bytecode ready.');
      } else {
        setAnnouncement('Compilation and execution finished.');
      }
      return;
    }

    // 3. Incremental errors when not compiling
    if (hadNewLogs && !isCompiling) {
      const newErrors = newLogs.filter((l) => l.level === 'error');
      if (newErrors.length > 0 && !wasCompiling) {
        setAnnouncement(
          `Compiler reported ${newErrors.length} new ${
            newErrors.length === 1 ? 'error' : 'errors'
          }.`
        );
      }
    }
  }, [isCompiling, errorLogs.length, logs]);

  // Handle test results announcement
  useEffect(() => {
    if (!testResults) return;

    const isChanged =
      !prevTestResultsRef.current ||
      testResults.passed !== prevTestResultsRef.current.passed ||
      testResults.failed !== prevTestResultsRef.current.failed ||
      testResults.total !== prevTestResultsRef.current.total;

    if (isChanged) {
      prevTestResultsRef.current = testResults;
      const totalStr = testResults.total ? ` out of ${testResults.total}` : '';
      const durationStr = testResults.durationMs ? ` in ${(testResults.durationMs / 1000).toFixed(2)} seconds` : '';
      setAnnouncement(
        `Test results announced: ${testResults.passed} passed, ${testResults.failed} failed${totalStr}${durationStr}.`
      );
    }
  }, [testResults]);

  // Jump to specific error line
  const jumpToError = useCallback(
    (targetLog: CompileLogEntry, index: number, total: number) => {
      setSelectedErrorId(targetLog.id);

      const targetEl = errorRefs.current.get(targetLog.id);
      if (targetEl) {
        if (typeof targetEl.scrollIntoView === 'function') {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (typeof targetEl.focus === 'function') {
          targetEl.focus();
        }
      }

      const meta = extractLineColumn(targetLog.message);
      const lineNum = targetLog.line ?? meta.line;
      const colNum = targetLog.column ?? meta.column;

      if (lineNum && onJumpToLine) {
        onJumpToLine(lineNum, colNum);
      }

      const lineText = lineNum ? ` at line ${lineNum}${colNum ? `, column ${colNum}` : ''}` : '';
      setAnnouncement(`Jumped to error ${index + 1} of ${total}${lineText}: ${targetLog.message}`);
    },
    [onJumpToLine]
  );

  // Jump to next error
  const handleNextError = useCallback(() => {
    if (errorLogs.length === 0) return;
    const currentIndex = errorLogs.findIndex((log) => log.id === selectedErrorId);
    const nextIndex = currentIndex === -1 || currentIndex >= errorLogs.length - 1 ? 0 : currentIndex + 1;
    const targetLog = errorLogs[nextIndex];
    if (targetLog) {
      jumpToError(targetLog, nextIndex, errorLogs.length);
    }
  }, [errorLogs, selectedErrorId, jumpToError]);

  // Jump to previous error
  const handlePrevError = useCallback(() => {
    if (errorLogs.length === 0) return;
    const currentIndex = errorLogs.findIndex((log) => log.id === selectedErrorId);
    const prevIndex = currentIndex <= 0 ? errorLogs.length - 1 : currentIndex - 1;
    const targetLog = errorLogs[prevIndex];
    if (targetLog) {
      jumpToError(targetLog, prevIndex, errorLogs.length);
    }
  }, [errorLogs, selectedErrorId, jumpToError]);

  // Keyboard navigation handler for error jumping: Alt+E / Alt+Shift+E or F4 / Shift+F4
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.altKey && e.key.toLowerCase() === 'e') || e.key === 'F4') {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevError();
        } else {
          handleNextError();
        }
      }
    },
    [handleNextError, handlePrevError]
  );

  return (
    <section
      id={terminalId}
      role="region"
      aria-label={title}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex min-h-[300px] flex-grow flex-col overflow-hidden rounded-2xl border border-white/10 bg-black text-slate-100 shadow-2xl',
        className
      )}
      data-testid="compiler-terminal"
    >
      {/* Visual Accent Top Bar */}
      <div
        className={cn(
          'absolute top-0 left-0 h-1 w-full transition-colors',
          currentStatus === 'compiling'
            ? 'bg-sky-500 animate-pulse'
            : currentStatus === 'error'
              ? 'bg-red-500'
              : currentStatus === 'success'
                ? 'bg-emerald-500'
                : 'bg-white/10'
        )}
      />

      {/* 1. ARIA 1.2 Dedicated Live Region for Polite Assistive Announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="additions text"
        className="sr-only"
        data-testid="terminal-live-announcer"
      >
        {announcement}
      </div>

      {/* Screen reader keyboard shortcut guidance */}
      <div id={`${idPrefix}-instructions`} className="sr-only">
        Compiler terminal output log. Press Alt+E to jump to the next compiler error line, or
        Alt+Shift+E for the previous error.
      </div>

      {/* Terminal Header & Navigation Controls */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3 bg-zinc-950/70">
        <div className="flex items-center gap-3">
          <TerminalIcon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
          <h2 className="text-xs font-mono font-bold tracking-widest text-zinc-300 uppercase">
            {title}
          </h2>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              currentStatus === 'compiling'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : currentStatus === 'error'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : currentStatus === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            )}
          >
            {currentStatus === 'compiling' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span>Compiling</span>
              </>
            ) : currentStatus === 'error' ? (
              <>
                <CircleAlert className="h-3 w-3" aria-hidden="true" />
                <span>Failed</span>
              </>
            ) : currentStatus === 'success' ? (
              <>
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span>Success</span>
              </>
            ) : (
              <span>Ready</span>
            )}
          </span>
        </div>

        {/* Test Summary and Error Navigation Toolbar */}
        <div className="flex items-center gap-2">
          {testResults && (
            <div
              className="flex items-center gap-2 rounded-lg bg-zinc-900 border border-white/10 px-2.5 py-1 text-xs font-mono"
              aria-label={`Test results: ${testResults.passed} passed, ${testResults.failed} failed`}
            >
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{testResults.passed} pass</span>
              </span>
              <span className="text-zinc-600">|</span>
              <span className="flex items-center gap-1 text-red-400">
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{testResults.failed} fail</span>
              </span>
            </div>
          )}

          {errorLogs.length > 0 && (
            <nav
              aria-label="Compiler error navigation"
              className="flex items-center gap-1 bg-zinc-900 border border-red-500/30 rounded-lg p-0.5"
            >
              <button
                type="button"
                onClick={handlePrevError}
                aria-label="Jump to previous compiler error (Alt+Shift+E)"
                className="flex items-center justify-center h-6 w-6 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span
                className="px-1 text-[11px] font-mono font-medium text-red-400"
                aria-live="polite"
              >
                {selectedErrorId
                  ? `${errorLogs.findIndex((l) => l.id === selectedErrorId) + 1}/${errorLogs.length}`
                  : `${errorLogs.length} ${errorLogs.length === 1 ? 'error' : 'errors'}`}
              </span>
              <button
                type="button"
                onClick={handleNextError}
                aria-label="Jump to next compiler error (Alt+E)"
                className="flex items-center justify-center h-6 w-6 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* 2. ARIA 1.2 Streaming Live Region for Terminal Log Outputs */}
      <div
        ref={viewportRef}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
        aria-describedby={`${idPrefix}-instructions`}
        tabIndex={0}
        aria-label="Streaming compilation and WASM execution logs"
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-6 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/40"
        data-testid="terminal-log-viewport"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-500 space-y-1">
            <p>&gt; Initializing Soroban Rust WASM toolchain...</p>
            <p>&gt; Awaiting compilation command...</p>
          </div>
        ) : (
          logs.map((log) => {
            const isError = log.level === 'error';
            const isSuccess = log.level === 'success';
            const isSelected = selectedErrorId === log.id;
            const meta = isError ? extractLineColumn(log.message) : {};
            const lineNum = log.line ?? meta.line;

            return (
              <div
                key={log.id}
                ref={(el) => {
                  if (isError && el) {
                    errorRefs.current.set(log.id, el);
                  } else if (isError) {
                    errorRefs.current.delete(log.id);
                  }
                }}
                tabIndex={isError ? -1 : undefined}
                aria-current={isSelected ? 'true' : undefined}
                className={cn(
                  'rounded px-1.5 py-0.5 transition-colors',
                  isSelected && 'bg-red-950/60 ring-1 ring-red-500',
                  isSuccess
                    ? 'text-emerald-400'
                    : isError
                      ? 'text-red-400'
                      : log.level === 'warn'
                        ? 'text-amber-300'
                        : 'text-zinc-300'
                )}
              >
                <span className="mr-2 text-zinc-600 select-none">[{log.timestamp}]</span>
                <span className="mr-2 inline-flex align-middle" aria-hidden="true">
                  {isSuccess ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : isError ? (
                    <CircleAlert className="h-3.5 w-3.5 text-red-400" />
                  ) : log.level === 'warn' ? (
                    <CircleAlert className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <span className="text-zinc-500">$</span>
                  )}
                </span>
                <span className="whitespace-pre-wrap">{log.message}</span>
                {lineNum && (
                  <span className="ml-2 rounded bg-zinc-800 px-1 py-0.2 text-[10px] text-zinc-400 select-none">
                    L:{lineNum}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Compiling Activity Footer Bar */}
      {isCompiling && (
        <footer className="border-t border-white/10 px-5 py-2.5 bg-zinc-950/40">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" aria-hidden="true" />
              <span>Building release bytecode for Soroban target...</span>
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
              <div className="h-full w-1/2 animate-[loading_1s_infinite] bg-sky-500 rounded-full" />
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}

export default CompilerTerminal;
