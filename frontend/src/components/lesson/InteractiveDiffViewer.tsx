'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Columns2, CopyPlus, GitCompare, Loader2, Rows2 } from 'lucide-react';
import { useDiffWorker } from '@/hooks/useDiffWorker';
import type { DiffChunk } from '@/lib/diff/diffTypes';

/**
 * InteractiveDiffViewer
 *
 * Side-by-side Monaco diff comparison for students to compare their working
 * contract code against model solutions. Features:
 *
 *  - **Inline / side-by-side toggles** via Monaco's `renderSideBySide`.
 *  - **Character-level highlighting** — Monaco's inline diff mode highlights
 *    changed characters, and the chunk list renders add/remove segments.
 *  - **Apply Diff Chunk** — each hunk gets a one-click control that merges the
 *    solution's lines for that hunk into the student buffer.
 *  - **Worker-backed diffing** — chunk computation runs in a Web Worker so
 *    large multi-file diffs never stutter the UI thread.
 *  - **Themes** — dark, light, and OLED Monaco themes (OLED defined on mount).
 *
 * The `DiffEditor` is pulled in via `next/dynamic` (`ssr: false`) to keep the
 * server bundle lean, matching `LessonCodeEditor`.
 */

const DiffEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full min-h-[300px] w-full items-center justify-center bg-zinc-950 text-zinc-500"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        <p className="text-xs tracking-widest uppercase">Loading diff editor…</p>
      </div>
    </div>
  ),
});

export type DiffTheme = 'dark' | 'light' | 'oled';
export type DiffViewMode = 'side-by-side' | 'inline';

export interface InteractiveDiffViewerProps {
  /** The student's current code (left / original side). */
  original: string;
  /** The model solution (right / modified side). */
  modified: string;
  /** Monaco language id (defaults to Rust for Soroban contracts). */
  language?: string;
  /** Filename shown in the header. */
  filename?: string;
  /** Active Monaco theme family. */
  theme?: DiffTheme;
  /** Initial view mode. */
  defaultViewMode?: DiffViewMode;
  /** Called with the merged buffer whenever the student applies a chunk. */
  onApplyChunk?: (chunk: DiffChunk, mergedCode: string) => void;
}

const THEME_TO_MONACO: Record<DiffTheme, string> = {
  dark: 'vs-dark',
  light: 'light',
  oled: 'oled-diff-theme',
};

function themeSurface(theme: DiffTheme): string {
  if (theme === 'oled') return 'bg-black';
  if (theme === 'light') return 'bg-zinc-100';
  return 'bg-[#09090b]';
}

function themeBorder(theme: DiffTheme): string {
  if (theme === 'light') return 'border-zinc-300';
  return 'border-white/10';
}

function themeText(theme: DiffTheme): string {
  if (theme === 'light') return 'text-zinc-600';
  return 'text-gray-400';
}

export function InteractiveDiffViewer({
  original,
  modified,
  language = 'rust',
  filename = 'lib.rs',
  theme = 'dark',
  defaultViewMode = 'side-by-side',
  onApplyChunk,
}: InteractiveDiffViewerProps) {
  const computeDiff = useDiffWorker();
  const [viewMode, setViewMode] = useState<DiffViewMode>(defaultViewMode);
  const [chunks, setChunks] = useState<DiffChunk[]>([]);
  const [computing, setComputing] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [buffer, setBuffer] = useState(original);

  useEffect(() => {
    setBuffer(original);
    setAppliedIds(new Set());
    setError(null);
  }, [original]);

  useEffect(() => {
    let cancelled = false;
    setComputing(true);
    setError(null);

    // Run chunk computation off the main thread; Monaco renders independently.
    computeDiff(original, modified)
      .then((result) => {
        if (cancelled) return;
        setChunks(result.chunks);
      })
      .catch(() => {
        if (!cancelled) setError('Could not compute the diff.');
      })
      .finally(() => {
        if (!cancelled) setComputing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [original, modified, computeDiff]);

  const monacoTheme = THEME_TO_MONACO[theme];

  const handleEditorMount = useCallback(
    (_editor: unknown, monaco: typeof import('@monaco-editor/react') extends never ? never : any) => {
      // Define the OLED theme once: pure black background, dim gray foreground.
      if (!monaco.editor.getTheme || !monaco.editor.defineTheme) return;
      if (!monaco.editor.getTheme('oled-diff-theme')) {
        monaco.editor.defineTheme('oled-diff-theme', {
          base: 'vs-dark',
          inherit: true,
          rules: [{ token: '', foreground: '9ca3af' }],
          colors: {
            'editor.background': '#000000',
            'editor.foreground': '#9ca3af',
            'diffEditor.insertedTextBackground': '#052e16',
            'diffEditor.removedTextBackground': '#450a0a',
            'editor.lineHighlightBackground': '#000000',
          },
        });
      }
    },
    []
  );

  const handleApplyChunk = useCallback(
    (chunk: DiffChunk) => {
      if (appliedIds.has(chunk.id)) return;
      const nextApplied = new Set(appliedIds);
      nextApplied.add(chunk.id);
      setAppliedIds(nextApplied);

      // Replace the chunk's original lines with the solution lines in the buffer.
      const originalLines = buffer.split('\n');
      const start = chunk.startLineOriginal - 1;
      const end = start + chunk.originalLines.length;
      const replacement = chunk.modifiedLines.map((line) => line.replace(/\n$/, ''));
      const merged = [...originalLines.slice(0, start), ...replacement, ...originalLines.slice(end)].join('\n');
      setBuffer(merged);
      onApplyChunk?.(chunk, merged);
    },
    [appliedIds, buffer, onApplyChunk]
  );

  const remainingCount = useMemo(
    () => chunks.filter((c) => !appliedIds.has(c.id)).length,
    [chunks, appliedIds]
  );

  return (
    <section
      role="region"
      aria-label={`Diff viewer for ${filename}`}
      className={`flex h-full min-h-[300px] flex-col overflow-hidden rounded-2xl border ${themeBorder(theme)} ${themeSurface(theme)}`}
    >
      {/* Toolbar */}
      <header
        className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 ${themeBorder(theme)} ${theme === 'light' ? 'bg-white' : 'bg-black/40'}`}
      >
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-red-500" aria-hidden="true" />
          <span className={`font-mono text-[11px] tracking-widest uppercase ${themeText(theme)}`}>
            {filename}
          </span>
          {computing && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" aria-label="Computing diff" />}
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div role="group" aria-label="Diff view mode" className="flex overflow-hidden rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              aria-pressed={viewMode === 'side-by-side'}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors ${
                viewMode === 'side-by-side'
                  ? 'bg-red-500 text-white'
                  : `${themeText(theme)} hover:bg-white/5`
              }`}
            >
              <Columns2 className="h-3 w-3" aria-hidden="true" />
              Side-by-side
            </button>
            <button
              type="button"
              onClick={() => setViewMode('inline')}
              aria-pressed={viewMode === 'inline'}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors ${
                viewMode === 'inline'
                  ? 'bg-red-500 text-white'
                  : `${themeText(theme)} hover:bg-white/5`
              }`}
            >
              <Rows2 className="h-3 w-3" aria-hidden="true" />
              Inline
            </button>
          </div>

          <span className={`text-[10px] font-bold tracking-widest uppercase ${themeText(theme)}`}>
            {remainingCount === 0 ? 'All changes applied' : `${remainingCount} change${remainingCount === 1 ? '' : 's'} left`}
          </span>
        </div>
      </header>

      {error && (
        <div role="alert" className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400">
          {error}
        </div>
      )}

      {/* Monaco diff */}
      <div className="relative min-h-[300px] flex-grow">
        <DiffEditor
          original={original}
          modified={modified}
          language={language}
          theme={monacoTheme}
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            renderSideBySide: viewMode === 'side-by-side',
            renderOverviewRuler: false,
          }}
        />
      </div>

      {/* Apply-chunk controls */}
      {chunks.length > 0 && (
        <footer className={`border-t ${themeBorder(theme)} bg-black/30 px-4 py-3`}>
          <div className="mb-2 flex items-center gap-2">
            <CopyPlus className="h-3.5 w-3.5 text-lime-400" aria-hidden="true" />
            <span className={`text-[10px] font-bold tracking-widest uppercase ${themeText(theme)}`}>
              Apply solution chunks
            </span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {chunks.map((chunk) => {
              const applied = appliedIds.has(chunk.id);
              return (
                <li key={chunk.id}>
                  <button
                    type="button"
                    onClick={() => handleApplyChunk(chunk)}
                    disabled={applied}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors ${
                      applied
                        ? 'cursor-default border-lime-500/30 bg-lime-500/10 text-lime-400'
                        : 'border-white/15 text-gray-300 hover:border-lime-400 hover:text-lime-300'
                    } disabled:opacity-80`}
                    aria-label={`${applied ? 'Applied chunk' : 'Apply chunk'} at line ${chunk.startLineOriginal}${chunk.kind === 'replace' ? ' (replace)' : ''}`}
                  >
                    {applied ? <Check className="h-3 w-3" aria-hidden="true" /> : <CopyPlus className="h-3 w-3" aria-hidden="true" />}
                    L{chunk.startLineOriginal}
                    {applied ? ' applied' : ' apply'}
                  </button>
                </li>
              );
            })}
          </ul>
        </footer>
      )}
    </section>
  );
}

export default InteractiveDiffViewer;
