'use client';

import { resolveConflict } from '@/lib/conflict/MergeStrategy';
import { computeDiffHunks } from '@/lib/diff/diffUtils';
import type { DatabaseManager, RevisionRecord } from '@/lib/storage/DatabaseManager';
import { GitBranch, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface RevisionHistoryPanelProps {
  databaseManager: DatabaseManager;
  path: string;
  currentContent: string;
  refreshKey: number;
  onApply: (content: string) => void;
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

export function RevisionHistoryPanel({
  databaseManager,
  path,
  currentContent,
  refreshKey,
  onApply,
}: RevisionHistoryPanelProps) {
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseContent, setBaseContent] = useState('');
  const [manualMerge, setManualMerge] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    databaseManager
      .listRevisions(path)
      .then((records) => {
        if (!active) return;
        setRevisions(records);
        setSelectedId((current) =>
          records.some((revision) => revision.id === current) ? current : records[0]?.id ?? null
        );
        setError(null);
      })
      .catch(() => {
        if (active) setError('Revision history is unavailable in this browser.');
      });
    return () => {
      active = false;
    };
  }, [databaseManager, path, refreshKey]);

  const selectedRevision = revisions.find((revision) => revision.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    if (!selectedRevision?.parentId) {
      setBaseContent('');
      return;
    }
    databaseManager.getRevision(selectedRevision.parentId).then((revision) => {
      if (active) setBaseContent(revision?.content ?? '');
    });
    return () => {
      active = false;
    };
  }, [databaseManager, selectedRevision?.parentId]);

  useEffect(() => {
    setManualMerge(currentContent);
  }, [currentContent, selectedId]);

  const revisionDiff = selectedRevision
    ? computeDiffHunks(currentContent, selectedRevision.content)
    : { hunks: [], identical: true };
  const isMineUnchanged = currentContent === baseContent;
  const isTheirsUnchanged = selectedRevision?.content === baseContent;
  const autoMergedContent = isMineUnchanged
    ? selectedRevision?.content
    : isTheirsUnchanged || currentContent === selectedRevision?.content
      ? currentContent
      : null;

  const applyMerge = async (strategy: 'mine' | 'theirs' | 'manual', manualText?: string) => {
    if (!selectedRevision) return;
    const result = resolveConflict(
      currentContent,
      selectedRevision.content,
      baseContent,
      strategy,
      manualText
    );
    if (!result.success || result.mergedText === undefined) {
      setError(result.error ?? 'Unable to resolve this merge.');
      return;
    }
    setError(null);
    if (strategy !== 'mine') {
      try {
        await databaseManager.setRevisionHead(path, selectedRevision.id);
      } catch {
        setError('Unable to update the selected revision branch.');
        return;
      }
    }
    onApply(result.mergedText);
  };

  return (
    <section className="mt-6 border-t border-white/10 pt-5" aria-label="Revision history">
      <div className="mb-4 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-red-400" aria-hidden="true" />
        <h2 className="text-sm font-bold text-white">Revision history</h2>
        <span className="text-xs text-zinc-500">{revisions.length}</span>
      </div>

      {error && <p className="mb-3 text-sm text-red-300" role="alert">{error}</p>}

      {revisions.length === 0 ? (
        <p className="text-sm text-zinc-500">Edits will appear here after they are saved.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.6fr)]">
          <ol className="max-h-72 space-y-1 overflow-y-auto border-l border-white/10 pl-3">
            {revisions.map((revision) => (
              <li key={revision.id} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectedId(revision.id)}
                  aria-current={selectedId === revision.id ? 'true' : undefined}
                  className={`w-full rounded-sm px-3 py-2 text-left transition ${
                    selectedId === revision.id
                      ? 'bg-red-500/10 text-white'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="block text-xs font-medium">{formatTimestamp(revision.createdAt)}</span>
                  <span className="mt-1 block text-[11px] text-zinc-500">
                    {revision.parentId ? 'Branch revision' : 'Root revision'}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {selectedRevision && (
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-400">
                  {revisionDiff.identical
                    ? 'Selected revision matches the working copy.'
                    : `${revisionDiff.hunks.length} change ${revisionDiff.hunks.length === 1 ? 'hunk' : 'hunks'}`}
                </p>
                <button
                  type="button"
                  onClick={() => applyMerge('theirs')}
                  className="inline-flex h-8 items-center gap-2 rounded-sm border border-white/15 px-3 text-xs text-zinc-200 transition hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Restore revision
                </button>
              </div>

              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Working copy</h3>
                  <pre className="max-h-48 overflow-auto rounded-sm border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-5 text-zinc-300">{currentContent}</pre>
                </div>
                <div className="min-w-0">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Selected revision</h3>
                  <pre className="max-h-48 overflow-auto rounded-sm border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-5 text-zinc-300">{selectedRevision.content}</pre>
                </div>
              </div>

              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer">Merge base · {selectedRevision.parentId ? 'parent revision' : 'empty file'}</summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded-sm border border-white/10 bg-black/40 p-3 font-mono leading-5">{baseContent}</pre>
              </details>

              {autoMergedContent !== null ? (
                <button
                  type="button"
                  onClick={() => applyMerge('manual', autoMergedContent)}
                  className="rounded-sm border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10"
                >
                  Apply non-conflicting result
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-200">Both versions changed from the merge base. Review and resolve the conflict.</p>
                  <textarea
                    value={manualMerge}
                    onChange={(event) => setManualMerge(event.target.value)}
                    aria-label="Manually merged source"
                    className="min-h-32 w-full resize-y rounded-sm border border-white/10 bg-black/50 p-3 font-mono text-xs leading-5 text-zinc-200 focus:border-red-500/50 focus:outline-none"
                    spellCheck={false}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyMerge('mine')}
                      className="rounded-sm border border-white/15 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                    >
                      Keep working copy
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMerge('theirs')}
                      className="rounded-sm border border-white/15 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                    >
                      Use revision
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMerge('manual', manualMerge)}
                      disabled={!manualMerge}
                      className="rounded-sm bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      Apply manual merge
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
