'use client';

import React from 'react';
import { CharacterSpan } from '@/utils/diffHighlighter';
import { useCodeDiff, DiffViewMode } from '@/hooks/useCodeDiff';

export interface DiffViewerModalProps {
  isOpen: boolean;
  title?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  originalCode: string;
  modifiedCode: string;
  defaultMode?: DiffViewMode;
  onApplyModifiedCode?: (updatedCode: string) => void;
  onClose: () => void;
}

function CharacterHighlightedSpans({ spans }: { spans: CharacterSpan[] }) {
  return (
    <span className="whitespace-pre-wrap font-mono text-xs">
      {spans.map((span, index) => {
        if (span.op === 1) {
          return (
            <span
              key={index}
              className="rounded bg-emerald-500/30 px-0.5 text-emerald-200"
              data-diff-op="insert"
            >
              {span.text}
            </span>
          );
        }
        if (span.op === -1) {
          return (
            <span
              key={index}
              className="rounded bg-rose-500/30 px-0.5 text-rose-200 line-through"
              data-diff-op="delete"
            >
              {span.text}
            </span>
          );
        }
        return (
          <span key={index} className="text-slate-300" data-diff-op="equal">
            {span.text}
          </span>
        );
      })}
    </span>
  );
}

export const DiffViewerModal: React.FC<DiffViewerModalProps> = ({
  isOpen,
  title = 'Contract Version Diff Viewer',
  originalLabel = 'Starter Template / Previous Commit',
  modifiedLabel = 'Current Working Draft',
  originalCode,
  modifiedCode: initialModifiedCode,
  defaultMode = 'side-by-side',
  onApplyModifiedCode,
  onClose,
}) => {
  const {
    mode,
    setMode,
    chunks,
    additions,
    deletions,
    copied,
    revertChunk,
    copyDiffToClipboard,
  } = useCodeDiff({
    originalCode,
    initialModifiedCode,
    defaultMode,
    onApplyModifiedCode,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <p className="text-xs text-slate-400">
              <span className="text-emerald-400">+{additions} additions</span>
              {' · '}
              <span className="text-rose-400">-{deletions} deletions</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setMode('side-by-side')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  mode === 'side-by-side'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Side-by-Side
              </button>
              <button
                type="button"
                onClick={() => setMode('inline')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  mode === 'inline'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Inline
              </button>
            </div>

            <button
              type="button"
              onClick={() => void copyDiffToClipboard()}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              {copied ? 'Copied Diff!' : 'Copy Diff'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-900/60 px-4 py-1.5 text-xs font-medium text-slate-400">
          <span>{originalLabel}</span>
          <span>{modifiedLabel}</span>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {chunks.map((chunk) => (
            <div
              key={chunk.id}
              className={`rounded-lg border ${
                chunk.hasChanges
                  ? 'border-cyan-800/60 bg-slate-900/70'
                  : 'border-slate-800 bg-slate-950'
              } p-3`}
            >
              <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Lines {chunk.originalStartLine} → {chunk.modifiedStartLine}
                </span>
                {chunk.hasChanges && (
                  <button
                    type="button"
                    onClick={() => revertChunk(chunk.id)}
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                  >
                    Revert Chunk
                  </button>
                )}
              </div>

              {mode === 'side-by-side' ? (
                <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                  <div className="rounded bg-rose-950/20 p-2">
                    {chunk.originalLines.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap text-rose-200">
                        {chunk.hasChanges ? `- ${line}` : `  ${line}`}
                      </div>
                    ))}
                  </div>
                  <div className="rounded bg-emerald-950/20 p-2">
                    {chunk.modifiedLines.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap text-emerald-200">
                        {chunk.hasChanges ? `+ ${line}` : `  ${line}`}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded bg-slate-900 p-2">
                  <CharacterHighlightedSpans spans={chunk.characterSpans} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
