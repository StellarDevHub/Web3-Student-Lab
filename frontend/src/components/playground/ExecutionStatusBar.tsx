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
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ExecutionStatusBarProps {
  state: ExecutionState;
  onCancel: () => void;
  onReset?: () => void;
  className?: string;
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
}: ExecutionStatusBarProps) {
  const { phase, statusMessage, queuePosition, enteredAt } = state;
  const isActive = phase === 'queued' || phase === 'running';
  const elapsed = useElapsedSeconds(isActive, enteredAt);

  // Don't render anything in the idle state — the compile button itself is enough.
  if (phase === 'idle') return null;

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
    </div>
  );
}
