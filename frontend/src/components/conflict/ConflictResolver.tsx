'use client';

import { ConflictInfo, conflictManager } from '@/lib/conflict/ConflictManager';
import { applyMergeToYjs, broadcastResolution, MergeStrategyType, resolveConflict } from '@/lib/conflict/MergeStrategy';
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
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Resolve Conflict</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} detected
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAcceptAll('mine')}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Accept All Mine
            </button>
            <button
              onClick={() => handleAcceptAll('theirs')}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              Accept All Theirs
            </button>
          </div>
        </div>

        {/* Conflict selector */}
        {conflicts.length > 1 && (
          <div className="px-6 py-2 border-b border-zinc-800 flex gap-2 overflow-x-auto">
            {conflicts.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setActiveConflict(c)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
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
            <div className="grid grid-cols-3 gap-4 h-full">
              <div>
                <div className="text-xs font-semibold text-zinc-400 mb-2">Mine</div>
                <textarea
                  readOnly
                  value={activeConflict.mine}
                  className="w-full h-[300px] bg-zinc-800 text-zinc-300 p-3 rounded-lg text-sm font-mono resize-none border border-zinc-700"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400 mb-2">Theirs</div>
                <textarea
                  readOnly
                  value={activeConflict.theirs}
                  className="w-full h-[300px] bg-zinc-800 text-zinc-300 p-3 rounded-lg text-sm font-mono resize-none border border-zinc-700"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400 mb-2">Result (edit here)</div>
                <textarea
                  value={manualMergeText}
                  onChange={(e) => setManualMergeText(e.target.value)}
                  placeholder="Manually edit the merged result..."
                  className="w-full h-[300px] bg-zinc-800 text-white p-3 rounded-lg text-sm font-mono resize-none border border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 border-t border-zinc-700 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setMode(mode === 'view' ? 'manual' : 'view')}
              className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              {mode === 'view' ? 'Manual Merge' : 'Diff View'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleResolve('mine')}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Accept Mine
            </button>
            <button
              onClick={() => handleResolve('theirs')}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              Accept Theirs
            </button>
            {mode === 'manual' && (
              <button
                onClick={() => handleResolve('manual')}
                disabled={!manualMergeText}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
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
