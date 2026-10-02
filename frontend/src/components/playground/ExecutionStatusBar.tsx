'use client';

/**
 * ExecutionStatusBar
 *
 * Displays the current compile/execution state to the student:
 *   – Idle:     shows nothing (returns null).
 *   – Queued:   spinner + "Queued" badge + optional queue position.
 *   – Running:  animated bar + "Compiling" badge + elapsed timer.
 *   – Complete: green checkmark + "Done" badge.
 *   – Cancelled: yellow indicator + "Cancelled" badge.
 *   – Error:    red indicator + "Failed" badge + retry affordance.
 *
 * Accessibility:
 *   – role="status" with aria-live="polite" for routine updates.
 *   – role="alert" on error so screen readers interrupt immediately.
 *   – Cancel button has an aria-label and is keyboard-focusable.
 *   – Progress bar has role="progressbar" with aria-valuetext.
 *   – All interactive elements meet 44×44px minimum touch target.
 */

import { type ExecutionState } from '@/lib/compiler/cancellationTypes';
import { X, Cpu, HardDrive, Database, Zap, AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface SimulationResult {
  cpuInstructions: number;
  cpuLimit: number;
  ramFootprintBytes: number;
  ramLimitBytes: number;
  ledgerReadCount: number;
  ledgerWriteCount: number;
  ledgerLimit: number;
  feeXlm: number;
  warning?: string;
}

interface ExecutionStatusBarProps {
  state: ExecutionState;
  onCancel: () => void;
  onReset?: () => void;
  className?: string;
  simulation?: SimulationResult | null;
}

/** Elapsed time counter — re-renders every second while running. */
function useElapsedSeconds(active: boolean, enteredAt: number): number {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.floor((Date.now() - enteredAt) / 1000));
    rafRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - enteredAt) / 1000));
    }, 1000);
    return () => {
      if (rafRef.current) clearInterval(rafRef.current);
    };
  }, [active, enteredAt]);

  return elapsed;
}

export function ExecutionStatusBar({
  state,
  onCancel,
  onReset,
  className = '',
  simulation = null,
}: ExecutionStatusBarProps) {
  const { phase, statusMessage, queuePosition, enteredAt } = state;
  const isActive = phase === 'queued' || phase === 'running';
  const elapsed = useElapsedSeconds(isActive, enteredAt);

  // Don't render anything in the idle state UNLESS there is simulation result to show.
  if (phase === 'idle' && !simulation) return null;

  const isError = phase === 'error';
  const isCancelled = phase === 'cancelled';
  const isComplete = phase === 'complete';

  // ── Visual tokens per phase ──────────────────────────────────────────────
  const borderColor = isError
    ? 'border-red-500/40'
    : isCancelled
    ? 'border-yellow-500/40'
    : isComplete
    ? 'border-green-500/40'
    : 'border-white/10';

  const badgeBg = isError
    ? 'bg-red-600/20 text-red-400'
    : isCancelled
    ? 'bg-yellow-600/20 text-yellow-400'
    : isComplete
    ? 'bg-green-600/20 text-green-400'
    : 'bg-white/10 text-zinc-400';

  const dotColor = isError
    ? 'bg-red-500'
    : isCancelled
    ? 'bg-yellow-500'
    : isComplete
    ? 'bg-green-500'
    : 'bg-blue-400 animate-pulse';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={[
        'flex flex-col gap-2 rounded-xl border px-4 py-3',
        'bg-zinc-950/80 backdrop-blur-sm',
        borderColor,
        className,
      ].join(' ')}
    >
      {/* ── Top row: dot + message + badge + cancel ── */}
      <div className="flex min-h-[44px] items-center gap-3">
        {/* Status dot */}
        <span
          aria-hidden="true"
          className={['h-2.5 w-2.5 flex-shrink-0 rounded-full', dotColor].join(' ')}
        />

        {/* Message */}
        <span className="flex-1 text-[11px] font-medium tracking-wide text-zinc-300">
          {statusMessage}
          {isActive && elapsed > 0 && (
            <span className="ml-2 text-zinc-500">({elapsed}s)</span>
          )}
        </span>

        {/* Phase badge */}
        <span
          className={[
            'rounded-full px-2 py-0.5 text-[9px] font-black tracking-widest uppercase',
            badgeBg,
          ].join(' ')}
        >
          {phase}
        </span>

        {/* Queue position when waiting */}
        {phase === 'queued' && queuePosition !== null && (
          <span
            aria-label={`Queue position ${queuePosition}`}
            className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold tracking-widest text-zinc-500 uppercase"
          >
            #{queuePosition}
          </span>
        )}

        {/* Cancel button — only while active */}
        {isActive && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel current compile operation"
            title="Cancel"
            className={[
              'inline-flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center',
              'rounded-lg border border-red-600/30 bg-red-600/10',
              'text-red-500 transition-colors hover:bg-red-600/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500',
            ].join(' ')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {/* Reset / retry — shown after terminal states */}
        {(isComplete || isCancelled || isError) && onReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label={isError ? 'Dismiss error and reset' : 'Dismiss status'}
            className={[
              'inline-flex h-[44px] items-center justify-center px-3',
              'rounded-lg border border-white/10 bg-white/5',
              'text-[9px] font-black tracking-widest text-zinc-400 uppercase',
              'transition-colors hover:text-white',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            ].join(' ')}
          >
            Dismiss
          </button>
        )}
      </div>

      {/* ── Progress bar — only while running ── */}
      {phase === 'running' && (
        <div
          role="progressbar"
          aria-label="Compile progress"
          aria-valuetext="Compiling…"
          aria-busy="true"
          className="h-1 w-full overflow-hidden rounded-full bg-white/5"
        >
          <div className="h-full w-full origin-left animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-red-500 to-transparent" />
        </div>
      )}

      {/* ── Error detail ── */}
      {isError && (
        <p className="text-[10px] text-red-400/80">
          Review the compile output for details. Correct the error and click{' '}
          <span className="font-bold">Execute Logic</span> to try again.
        </p>
      )}

      {/* ── Pre-Flight Simulation Engine, Resource Profiler & Gas Visualizer ── */}
      {simulation && (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-zinc-300">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
                Pre-Flight Simulation & Gas Profiler
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-400 border border-amber-500/25">
                Fee: {simulation.feeXlm.toFixed(4)} XLM
              </span>
            </div>
          </div>

          {simulation.warning && (
            <div className="flex items-center gap-2 rounded bg-yellow-500/10 p-2 text-[11px] text-yellow-400 border border-yellow-500/20">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{simulation.warning}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* CPU Instructions */}
            <div className="flex flex-col gap-1 rounded bg-white/5 p-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Cpu className="h-3.5 w-3.5 text-blue-400" /> CPU Instructions
                </span>
                <span className="font-mono text-zinc-200">
                  {simulation.cpuInstructions.toLocaleString()} / {simulation.cpuLimit.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    simulation.cpuInstructions / simulation.cpuLimit > 0.8
                      ? 'bg-red-500'
                      : simulation.cpuInstructions / simulation.cpuLimit > 0.6
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (simulation.cpuInstructions / simulation.cpuLimit) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* RAM Footprint */}
            <div className="flex flex-col gap-1 rounded bg-white/5 p-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <HardDrive className="h-3.5 w-3.5 text-purple-400" /> RAM Footprint
                </span>
                <span className="font-mono text-zinc-200">
                  {(simulation.ramFootprintBytes / 1024).toFixed(1)} KB / {(simulation.ramLimitBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    simulation.ramFootprintBytes / simulation.ramLimitBytes > 0.8
                      ? 'bg-red-500'
                      : simulation.ramFootprintBytes / simulation.ramLimitBytes > 0.6
                      ? 'bg-yellow-500'
                      : 'bg-purple-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (simulation.ramFootprintBytes / simulation.ramLimitBytes) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Ledger Reads/Writes */}
            <div className="flex flex-col gap-1 rounded bg-white/5 p-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Database className="h-3.5 w-3.5 text-emerald-400" /> Ledger R/W
                </span>
                <span className="font-mono text-zinc-200">
                  R: {simulation.ledgerReadCount} | W: {simulation.ledgerWriteCount} ({simulation.ledgerLimit} max)
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    (simulation.ledgerReadCount + simulation.ledgerWriteCount) / simulation.ledgerLimit > 0.8
                      ? 'bg-red-500'
                      : (simulation.ledgerReadCount + simulation.ledgerWriteCount) / simulation.ledgerLimit > 0.6
                      ? 'bg-yellow-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      ((simulation.ledgerReadCount + simulation.ledgerWriteCount) / simulation.ledgerLimit) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
