'use client';

import { ConflictInfo, conflictManager } from '@/lib/conflict/ConflictManager';
import {
  applyMergeToYjs,
  broadcastResolution,
  MergeStrategyType,
  resolveConflict,
} from '@/lib/conflict/MergeStrategy';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import DiffView from './DiffView';

interface ConflictResolverProps {
  doc: Y.Doc;
  undoManager?: Y.UndoManager | null;
  localContent: string;
  onResolved?: () => void;
}

export default function ConflictResolver({
  doc,
  undoManager,
  localContent,
  onResolved,
}: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [activeConflict, setActiveConflict] = useState<ConflictInfo | null>(null);
  const [manualMergeText, setManualMergeText] = useState('');
  const [mode, setMode] = useState<'view' | 'manual'>('view');

  useEffect(() => {
    const detected = conflictManager.detectConflicts(doc, localContent);
    setConflicts(conflictManager.getAllConflicts());
    if (detected.length > 0 && !activeConflict) {
      setActiveConflict(detected[0]);
    }

    const unsubscribe = conflictManager.onConflictsChanged((updated) => {
      setConflicts(updated);
    });

    return unsubscribe;
  }, [doc, localContent]);

  const handleResolve = (strategy: MergeStrategyType) => {
    if (!activeConflict) return;

    const result = resolveConflict(
      activeConflict.mine,
      activeConflict.theirs,
      activeConflict.base,
      strategy,
      strategy === 'manual' ? manualMergeText : undefined
    );

    if (result.success && result.mergedText) {
      applyMergeToYjs(doc, result.mergedText, undoManager || null);
      broadcastResolution(doc, activeConflict.id, strategy);
      conflictManager.acceptTheirs(activeConflict.id);

      const remaining = conflictManager.getPendingConflicts();
      if (remaining.length > 0) {
        setActiveConflict(remaining[0]);
      } else {
        setActiveConflict(null);
        onResolved?.();
      }
    }
  };

  const handleAcceptAll = (strategy: 'mine' | 'theirs') => {
    conflictManager.acceptAll(doc, strategy);
    setActiveConflict(null);
    setConflicts([]);
    onResolved?.();
  };

  if (!activeConflict) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Resolve Conflict</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} detected
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAcceptAll('mine')}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700"
            >
              Accept All Mine
            </button>
            <button
              onClick={() => handleAcceptAll('theirs')}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-green-700"
            >
              Accept All Theirs
            </button>
          </div>
        </div>

        {/* Conflict selector */}
        {conflicts.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 px-6 py-2">
            {conflicts.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setActiveConflict(c)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  activeConflict.id === c.id
                    ? 'bg-blue-600 text-white'
                    : c.resolved
                      ? 'bg-green-900/50 text-green-400'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                Conflict {i + 1} {c.resolved ? '✓' : ''}
              </button>
            ))}
          </div>
        )}

        {/* Diff view */}
        {mode === 'view' ? (
          <div className="flex-1 overflow-auto p-6">
            <DiffView mine={activeConflict.mine} theirs={activeConflict.theirs} />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <div className="grid h-full grid-cols-3 gap-4">
              <div>
                <div className="mb-2 text-xs font-semibold text-zinc-400">Mine</div>
                <textarea
                  readOnly
                  value={activeConflict.mine}
                  className="h-[300px] w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-300"
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-zinc-400">Theirs</div>
                <textarea
                  readOnly
                  value={activeConflict.theirs}
                  className="h-[300px] w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 font-mono text-sm text-zinc-300"
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-zinc-400">Result (edit here)</div>
                <textarea
                  value={manualMergeText}
                  onChange={(e) => setManualMergeText(e.target.value)}
                  placeholder="Manually edit the merged result..."
                  className="h-[300px] w-full resize-none rounded-lg border border-blue-600 bg-zinc-800 p-3 font-mono text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-zinc-700 px-6 py-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode(mode === 'view' ? 'manual' : 'view')}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              {mode === 'view' ? 'Manual Merge' : 'Diff View'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleResolve('mine')}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
            >
              Accept Mine
            </button>
            <button
              onClick={() => handleResolve('theirs')}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700"
            >
              Accept Theirs
            </button>
            {mode === 'manual' && (
              <button
                onClick={() => handleResolve('manual')}
                disabled={!manualMergeText}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                Apply Merge
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
