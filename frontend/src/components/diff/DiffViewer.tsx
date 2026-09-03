'use client';

import { applyHunks, type DiffHunk } from '@/lib/diff/diffUtils';
import { THEME_COLORS } from '@/lib/theme/themeColors';
import type { OnMount } from '@monaco-editor/react';
import { Check, Columns2, GitCompareArrows, Rows3 } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { editor } from 'monaco-editor';
import React, { useCallback, useEffect, useRef, useState } from 'react';

const DiffEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        <p className="text-xs tracking-widest uppercase">Loading diff viewer…</p>
      </div>
    </div>
  ),
});

export interface DiffViewerProps {
  /** Student's working contract code. */
  original: string;
  /** Model solution / compiler-fixed code. */
  modified: string;
  /** Filename shown in the header. */
  filename?: string;
  /** Language id handed to Monaco. */
  language?: string;
  /** Called after a diff chunk is merged into the student buffer. */
  onApply?: (nextBuffer: string) => void;
  theme?: 'dark' | 'light' | 'oled';
}

/** Renders the chunk list with per-hunk Apply controls. */
function HunkList({
  hunks,
  applied,
  onApplyHunk,
  onApplyAll,
}: {
  hunks: DiffHunk[];
  applied: Set<string>;
  onApplyHunk: (hunk: DiffHunk) => void;
  onApplyAll: () => void;
}) {
  if (hunks.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-emerald-400">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Identical — no differences.
      </div>
    );
  }

  return (
    <div className="border-b border-white/5">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
          {hunks.length} chunk{hunks.length > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={onApplyAll}
          disabled={hunks.every((h) => applied.has(h.id))}
          className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-bold tracking-widest text-zinc-300 uppercase transition-colors hover:border-emerald-500/40 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply all
        </button>
      </div>
      <ul className="max-h-40 overflow-y-auto px-2 pb-2">
        {hunks.map((hunk) => {
          const done = applied.has(hunk.id);
          return (
            <li key={hunk.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5">
              <span className="w-14 shrink-0 font-mono text-[10px] text-zinc-500">
                L{hunk.originalStart + 1}
              </span>
              <span className="flex-1 truncate font-mono text-[10px] text-zinc-400">
                {hunk.originalLines.length} → {hunk.modifiedLines.length} lines
              </span>
              <button
                type="button"
                onClick={() => onApplyHunk(hunk)}
                disabled={done}
                className="flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300 uppercase transition-colors hover:border-emerald-500/40 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {done ? <Check className="h-3 w-3" aria-hidden="true" /> : <GitCompareArrows className="h-3 w-3" aria-hidden="true" />}
                {done ? 'Applied' : 'Apply'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DiffViewer({
  original,
  modified,
  filename = 'lib.rs',
  language = 'rust',
  onApply,
  theme = 'dark',
}: DiffViewerProps) {
  const [sideBySide, setSideBySide] = useState(true);
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [buffer, setBuffer] = useState(original);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  // Compute hunks off-thread; fall back to main-thread computation when the
  // worker cannot be constructed (e.g. some test/SSR environments).
  useEffect(() => {
    let cancelled = false;
    const compute = () => {
      if (cancelled) return;
      try {
        if (typeof Worker !== 'undefined') {
          if (!workerRef.current) {
            workerRef.current = new Worker(new URL('@/lib/diff/diff.worker.ts', import.meta.url));
            workerRef.current.onmessage = (event: MessageEvent) => {
              const { result } = event.data;
              if (!cancelled) setHunks(result.hunks);
            };
          }
          const id = ++requestIdRef.current;
          workerRef.current.postMessage({ id, original, modified });
        } else {
          // Fallback (rare): synchronous computation.
          import('@/lib/diff/diffUtils').then(({ computeDiffHunks }) => {
            if (!cancelled) setHunks(computeDiffHunks(original, modified).hunks);
          });
        }
      } catch {
        import('@/lib/diff/diffUtils').then(({ computeDiffHunks }) => {
          if (!cancelled) setHunks(computeDiffHunks(original, modified).hunks);
        });
      }
    };
    compute();
    return () => {
      cancelled = true;
    };
  }, [original, modified]);

  useEffect(() => {
    setBuffer(original);
    setApplied(new Set());
  }, [original]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleApplyHunk = useCallback(
    (hunk: DiffHunk) => {
      setBuffer((prev) => {
        const next = applyHunks(prev, [hunk]);
        if (next !== prev) {
          setApplied((prevSet) => new Set(prevSet).add(hunk.id));
          onApply?.(next);
        }
        return next;
      });
    },
    [onApply],
  );

  const handleApplyAll = useCallback(() => {
    setBuffer((prev) => {
      const next = applyHunks(prev, hunks);
      if (next !== prev) {
        setApplied(new Set(hunks.map((h) => h.id)));
        onApply?.(next);
      }
      return next;
    });
  }, [hunks, onApply]);

  const handleEditorMount: OnMount = useCallback(
    (_editor, monaco) => {
      const palette = theme === 'light' ? THEME_COLORS.light : THEME_COLORS.dark;
      const bg = theme === 'oled' ? '#000000' : palette.background.primary;
      monaco.editor.defineTheme('web3-lab-diff', {
        base: theme === 'light' ? 'vs' : 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '636e7b', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'ff7b72', fontStyle: 'bold' },
          { token: 'string', foreground: 'a5d6ff' },
          { token: 'type', foreground: '79c0ff' },
          { token: 'function', foreground: 'd2a8ff' },
          {
            token: 'sorobanMacro',
            foreground: palette.interactive.primary.replace('#', ''),
            fontStyle: 'bold',
          },
          {
            token: 'sorobanType',
            foreground: palette.status.info.replace('#', ''),
            fontStyle: 'bold',
          },
        ],
        colors: {
          'editor.background': bg,
          'editor.lineHighlightBackground': '#ffffff08',
          'editorLineNumber.foreground': palette.text.muted,
          'editorLineNumber.activeForeground': palette.text.secondary,
          'diffEditor.insertedTextBackground': '#00ff0022',
          'diffEditor.removedTextBackground': '#ff000022',
          'diffEditor.insertedLineBackground': '#00ff0011',
          'diffEditor.removedLineBackground': '#ff000011',
        },
      });
      monaco.editor.setTheme('web3-lab-diff');
    },
    [theme],
  );

  return (
    <section
      role="region"
      aria-label={`Diff viewer — ${filename}`}
      className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#09090b]"
    >
      <header className="flex items-center gap-3 border-b border-white/5 bg-black/40 px-4 py-2">
        <span className="font-mono text-[11px] tracking-widest text-zinc-400 uppercase">{filename}</span>
        <div className="flex-grow" />
        <span className="text-[10px] text-zinc-500">
          {sideBySide ? 'Side-by-side' : 'Inline'}
        </span>
        <div
          role="group"
          aria-label="Diff view mode"
          className="flex overflow-hidden rounded-md border border-white/10"
        >
          <button
            type="button"
            onClick={() => setSideBySide(false)}
            aria-pressed={!sideBySide}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-wider uppercase transition-colors ${
              !sideBySide ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Rows3 className="h-3 w-3" aria-hidden="true" />
            Inline
          </button>
          <button
            type="button"
            onClick={() => setSideBySide(true)}
            aria-pressed={sideBySide}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-wider uppercase transition-colors ${
              sideBySide ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Columns2 className="h-3 w-3" aria-hidden="true" />
            Split
          </button>
        </div>
      </header>

      <HunkList
        hunks={hunks}
        applied={applied}
        onApplyHunk={handleApplyHunk}
        onApplyAll={handleApplyAll}
      />

      <div className="relative min-h-[300px] flex-grow">
        <DiffEditor
          height="100%"
          original={buffer}
          modified={modified}
          language={language}
          onMount={handleEditorMount}
          options={{
            renderSideBySide: sideBySide,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            readOnly: true,
            renderIndicators: true,
            enableSplitViewResizing: true,
            padding: { top: 16 },
          }}
        />
      </div>
    </section>
  );
}

export default DiffViewer;
