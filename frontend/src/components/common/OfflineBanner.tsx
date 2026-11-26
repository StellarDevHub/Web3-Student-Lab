'use client';

/**
 * OfflineBanner — FE-070
 *
 * Two responsibilities:
 *  1. Show a dismissible status banner when the user is offline or when a
 *     sync is in progress / errored.
 *  2. Render an interactive side-by-side diff conflict modal when
 *     `useOfflineSync` surfaces concurrent multi-device edits.
 *
 * The component is designed to be dropped at the root layout level and wired
 * to the same `useOfflineSync` instance that code-editor pages use.
 */

import React, { useState, useCallback } from 'react';
import {
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  GitMerge,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { type SyncConflict, type SyncState } from '@/lib/storage/SyncManager';
import { computeDiffHunks } from '@/lib/diff/diffUtils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OfflineBannerProps {
  isOnline: boolean;
  syncState: SyncState;
  conflicts: SyncConflict[];
  pendingCount: number;
  onRetrySync?: () => void;
  onResolveConflict: (
    conflict: SyncConflict,
    resolution: 'mine' | 'theirs' | 'merged',
    mergedContent?: string,
  ) => void;
  onDismissConflict: (conflict: SyncConflict) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Status banner
// ---------------------------------------------------------------------------

export function OfflineBanner({
  isOnline,
  syncState,
  conflicts,
  pendingCount,
  onRetrySync,
  onResolveConflict,
  onDismissConflict,
  className = '',
}: OfflineBannerProps) {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [activeConflictIndex, setActiveConflictIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  // Open conflict modal automatically when new conflicts arrive.
  const prevConflictsLength = React.useRef(0);
  React.useEffect(() => {
    if (conflicts.length > 0 && conflicts.length !== prevConflictsLength.current) {
      setActiveConflictIndex(0);
      setModalOpen(true);
    }
    prevConflictsLength.current = conflicts.length;
  }, [conflicts]);

  const handleOpenConflicts = useCallback(() => {
    setActiveConflictIndex(0);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  // ---- Banner visibility logic ----
  const showOffline = !isOnline;
  const showSyncing = isOnline && syncState === 'syncing';
  const showError = isOnline && syncState === 'error';
  const showConflict = conflicts.length > 0;
  const showBanner =
    !bannerDismissed && (showOffline || showSyncing || showError || showConflict);

  if (!showBanner && !modalOpen) return null;

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Status banner                                                       */}
      {/* ------------------------------------------------------------------ */}
      {showBanner && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={[
            'fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 shadow-xl',
            'border backdrop-blur-sm transition-all duration-300',
            showOffline
              ? 'border-zinc-700 bg-zinc-900/95 text-zinc-200'
              : showError
                ? 'border-red-700/60 bg-red-950/90 text-red-200'
                : showConflict
                  ? 'border-amber-700/60 bg-amber-950/90 text-amber-200'
                  : 'border-emerald-700/40 bg-emerald-950/80 text-emerald-200',
            className,
          ].join(' ')}
        >
          {/* Icon */}
          {showOffline && <WifiOff className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />}
          {showSyncing && (
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-emerald-400" aria-hidden />
          )}
          {showError && <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" aria-hidden />}
          {showConflict && !showOffline && !showError && (
            <GitMerge className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          )}

          {/* Message */}
          <span className="text-sm font-medium">
            {showOffline && (
              <>
                You're offline
                {pendingCount > 0 && (
                  <span className="ml-1 text-zinc-400">
                    — {pendingCount} change{pendingCount !== 1 ? 's' : ''} queued
                  </span>
                )}
              </>
            )}
            {!showOffline && showSyncing && 'Syncing changes…'}
            {!showOffline && showError && 'Sync failed — changes are saved locally'}
            {!showOffline && !showError && showConflict && (
              <>
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected
              </>
            )}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {showError && onRetrySync && (
              <button
                onClick={onRetrySync}
                className="rounded-lg border border-red-600/50 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Retry
              </button>
            )}
            {showConflict && (
              <button
                onClick={handleOpenConflicts}
                className="rounded-lg border border-amber-600/50 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-900/40 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                Review
              </button>
            )}
            <button
              aria-label="Dismiss notification"
              onClick={() => setBannerDismissed(true)}
              className="rounded-md p-1 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Conflict modal                                                      */}
      {/* ------------------------------------------------------------------ */}
      {modalOpen && conflicts.length > 0 && (
        <ConflictModal
          conflicts={conflicts}
          activeIndex={activeConflictIndex}
          onChangeIndex={setActiveConflictIndex}
          onResolve={onResolveConflict}
          onDismiss={onDismissConflict}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Conflict modal
// ---------------------------------------------------------------------------

interface ConflictModalProps {
  conflicts: SyncConflict[];
  activeIndex: number;
  onChangeIndex: (i: number) => void;
  onResolve: (
    conflict: SyncConflict,
    resolution: 'mine' | 'theirs' | 'merged',
    mergedContent?: string,
  ) => void;
  onDismiss: (conflict: SyncConflict) => void;
  onClose: () => void;
}

function ConflictModal({
  conflicts,
  activeIndex,
  onChangeIndex,
  onResolve,
  onDismiss,
  onClose,
}: ConflictModalProps) {
  const conflict = conflicts[activeIndex];

  const [mergedContent, setMergedContent] = useState<string>(conflict?.local.content ?? '');
  const [mergeMode, setMergeMode] = useState(false);

  // Reset editor when navigating between conflicts.
  React.useEffect(() => {
    setMergedContent(conflict?.local.content ?? '');
    setMergeMode(false);
  }, [activeIndex, conflict?.path]);

  if (!conflict) return null;

  const diff = computeDiffHunks(conflict.local.content, conflict.remote.content);

  const handleResolve = (resolution: 'mine' | 'theirs' | 'merged') => {
    onResolve(conflict, resolution, resolution === 'merged' ? mergedContent : undefined);
    // If there are more conflicts, advance to the next one; otherwise close.
    if (conflicts.length <= 1) {
      onClose();
    } else {
      onChangeIndex(Math.min(activeIndex, conflicts.length - 2));
    }
  };

  const handleDismiss = () => {
    onDismiss(conflict);
    if (conflicts.length <= 1) {
      onClose();
    } else {
      onChangeIndex(Math.min(activeIndex, conflicts.length - 2));
    }
  };

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolve edit conflict"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <GitMerge className="h-5 w-5 text-amber-400" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-white">Edit Conflict</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                <code className="font-mono">{conflict.path}</code>
                {conflicts.length > 1 && (
                  <span className="ml-2 text-zinc-500">
                    ({activeIndex + 1} / {conflicts.length})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Navigate between conflicts */}
            {conflicts.length > 1 && (
              <>
                <button
                  aria-label="Previous conflict"
                  disabled={activeIndex === 0}
                  onClick={() => onChangeIndex(activeIndex - 1)}
                  className="rounded-md p-1 text-zinc-400 hover:text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  aria-label="Next conflict"
                  disabled={activeIndex === conflicts.length - 1}
                  onClick={() => onChangeIndex(activeIndex + 1)}
                  className="rounded-md p-1 text-zinc-400 hover:text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </>
            )}
            <button
              aria-label="Close conflict dialog"
              onClick={onClose}
              className="rounded-md p-1 text-zinc-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {!mergeMode ? (
            /* Side-by-side diff view */
            <SideBySideDiff conflict={conflict} />
          ) : (
            /* Manual merge editor */
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-400">
                Edit the merged result below, then click <strong className="text-white">Save merge</strong>.
              </p>
              <textarea
                aria-label="Merged content editor"
                value={mergedContent}
                onChange={(e) => setMergedContent(e.target.value)}
                spellCheck={false}
                className="h-72 w-full resize-y rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {/* Footer — resolution actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <ResolutionButton
              label="Keep my version"
              description="Discard the remote change"
              variant="mine"
              onClick={() => handleResolve('mine')}
            />
            <ResolutionButton
              label="Use their version"
              description="Discard your local change"
              variant="theirs"
              onClick={() => handleResolve('theirs')}
            />
            {mergeMode ? (
              <ResolutionButton
                label="Save merge"
                description="Use the edited content above"
                variant="merge"
                onClick={() => handleResolve('merged')}
              />
            ) : (
              <button
                onClick={() => {
                  setMergedContent(conflict.local.content);
                  setMergeMode(true);
                }}
                className="rounded-lg border border-indigo-600/50 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/30 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Edit manually
              </button>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            Decide later
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side-by-side diff view
// ---------------------------------------------------------------------------

function SideBySideDiff({ conflict }: { conflict: SyncConflict }) {
  const { hunks, identical } = computeDiffHunks(conflict.local.content, conflict.remote.content);

  if (identical) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        The two versions are identical — no changes to merge.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Local (mine) */}
      <DiffPane
        label="Your version"
        labelColor="text-indigo-300"
        borderColor="border-indigo-700/40"
        content={conflict.local.content}
        otherContent={conflict.remote.content}
        side="original"
      />
      {/* Remote (theirs) */}
      <DiffPane
        label="Their version"
        labelColor="text-rose-300"
        borderColor="border-rose-700/40"
        content={conflict.remote.content}
        otherContent={conflict.local.content}
        side="modified"
      />
    </div>
  );
}

interface DiffPaneProps {
  label: string;
  labelColor: string;
  borderColor: string;
  content: string;
  otherContent: string;
  side: 'original' | 'modified';
}

function DiffPane({ label, labelColor, borderColor, content, otherContent }: DiffPaneProps) {
  const { hunks } = computeDiffHunks(content, otherContent);
  const lines = content.split('\n');

  // Build a set of line numbers that appear in a hunk's original/modified.
  const changedLines = new Set<number>();
  for (const hunk of hunks) {
    for (let i = 0; i < hunk.originalLines.length; i++) {
      changedLines.add(hunk.originalStart + i);
    }
  }

  return (
    <div className={`flex flex-col rounded-lg border ${borderColor} overflow-hidden`}>
      <div className={`px-3 py-1.5 text-xs font-semibold ${labelColor} bg-zinc-900`}>
        {label}
      </div>
      <div className="overflow-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <tbody>
            {lines.map((line, idx) => {
              const isChanged = changedLines.has(idx);
              return (
                <tr
                  key={idx}
                  className={isChanged ? 'bg-amber-950/40' : 'bg-transparent'}
                >
                  <td
                    className="w-10 select-none border-r border-white/5 px-2 text-right text-zinc-600"
                    aria-hidden
                  >
                    {idx + 1}
                  </td>
                  <td className="px-3 py-0.5 text-zinc-200 whitespace-pre-wrap break-all">
                    {line || '\u00a0'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolution button
// ---------------------------------------------------------------------------

interface ResolutionButtonProps {
  label: string;
  description: string;
  variant: 'mine' | 'theirs' | 'merge';
  onClick: () => void;
}

function ResolutionButton({ label, description, variant, onClick }: ResolutionButtonProps) {
  const colors: Record<string, string> = {
    mine: 'border-indigo-600/50 text-indigo-300 hover:bg-indigo-900/30 focus:ring-indigo-500',
    theirs: 'border-rose-600/50 text-rose-300 hover:bg-rose-900/30 focus:ring-rose-500',
    merge: 'border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/30 focus:ring-emerald-500',
  };
  return (
    <button
      onClick={onClick}
      title={description}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 ${colors[variant]}`}
    >
      {label}
    </button>
  );
}
