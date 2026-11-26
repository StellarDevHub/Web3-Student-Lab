'use client';

import { useOptionalTheme } from '@/contexts/ThemeContext';
import { applyHunks, type DiffHunk } from '@/lib/diff/diffUtils';
import { HIGH_CONTRAST_DIFF_COLORS, THEME_COLORS, type ThemeName } from '@/lib/theme/themeColors';
import type { Monaco, OnMount } from '@monaco-editor/react';
import { Check, Columns2, GitCompareArrows, Rows3 } from 'lucide-react';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import '@/lib/editor/monaco-loader';

const DiffEditor = dynamic(
  () => import('@/lib/editor/monaco-loader').then(() => import('@monaco-editor/react').then((m) => m.DiffEditor)),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-200">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <p className="text-xs tracking-widest uppercase">Loading diff viewer…</p>
        </div>
      </div>
    ),
  },
);

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
  theme?: ThemeName;
  /** Explicitly enable WCAG AAA high-contrast mode. */
  highContrast?: boolean;
}

const ADDED_PATTERN_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(92, 255, 138, 0.22) 0px, rgba(92, 255, 138, 0.22) 3px, transparent 3px, transparent 6px)',
};

const REMOVED_PATTERN_STYLE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(255, 148, 148, 0.24) 0px, rgba(255, 148, 148, 0.24) 3px, transparent 3px, transparent 6px)',
};

/** Renders the chunk list with per-hunk Apply controls and accessible +/- symbols. */
function HunkList({
  hunks,
  applied,
  onApplyHunk,
  onApplyAll,
  isHighContrast,
}: {
  hunks: DiffHunk[];
  applied: Set<string>;
  onApplyHunk: (hunk: DiffHunk) => void;
  onApplyAll: () => void;
  isHighContrast: boolean;
}) {
  if (hunks.length === 0) {
    return (
      <div
        className={`flex items-center gap-2 px-4 py-3 text-xs ${
          isHighContrast ? 'bg-[#000000] font-semibold text-[#5cff8a]' : 'text-emerald-400'
        }`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Identical — no differences.
      </div>
    );
  }

  return (
    <div className={isHighContrast ? 'border-b-2 border-[#ffffff] bg-[#000000]' : 'border-b border-white/5'}>
      <div className="flex items-center justify-between px-4 py-2">
        <span
          className={`text-[10px] font-bold tracking-widest uppercase ${
            isHighContrast ? 'text-[#ffffff]' : 'text-zinc-400'
          }`}
        >
          {hunks.length} chunk{hunks.length > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={onApplyAll}
          disabled={hunks.every((h) => applied.has(h.id))}
          className={`rounded-md px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            isHighContrast
              ? 'border-2 border-[#ffd400] bg-[#000000] text-[#ffd400] hover:bg-[#ffd400] hover:text-[#000000] focus:ring-2 focus:ring-[#ffd400] focus:outline-none'
              : 'border border-white/10 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-400'
          }`}
        >
          Apply all
        </button>
      </div>
      <ul className="max-h-40 overflow-y-auto px-2 pb-2">
        {hunks.map((hunk) => {
          const done = applied.has(hunk.id);
          const removedCount = hunk.originalLines.length;
          const addedCount = hunk.modifiedLines.length;
          return (
            <li
              key={hunk.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                isHighContrast
                  ? 'border border-transparent hover:border-[#d4d4d4] hover:bg-[#141414]'
                  : 'hover:bg-white/5'
              }`}
            >
              <span
                className={`w-14 shrink-0 font-mono text-[10px] ${
                  isHighContrast ? 'font-bold text-[#f5f5f5]' : 'text-zinc-400'
                }`}
              >
                L{hunk.originalStart + 1}
              </span>
              <span
                className="flex flex-1 items-center gap-2 truncate font-mono text-[10px]"
                aria-label={`${removedCount} removed, ${addedCount} added`}
              >
                <span
                  data-diff-change="removed"
                  style={isHighContrast ? REMOVED_PATTERN_STYLE : undefined}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold ${
                    isHighContrast
                      ? 'border border-dashed border-[#ff9494] bg-[#2b0000] text-[#ffffff]'
                      : 'border border-red-500/40 bg-red-950/50 text-red-200'
                  }`}
                >
                  <span aria-hidden="true">{HIGH_CONTRAST_DIFF_COLORS.removedSymbol}</span>
                  <span>{removedCount}</span>
                </span>
                <span
                  data-diff-change="added"
                  style={isHighContrast ? ADDED_PATTERN_STYLE : undefined}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold ${
                    isHighContrast
                      ? 'border border-solid border-[#5cff8a] bg-[#00260f] text-[#ffffff]'
                      : 'border border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                  }`}
                >
                  <span aria-hidden="true">{HIGH_CONTRAST_DIFF_COLORS.addedSymbol}</span>
                  <span>{addedCount}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => onApplyHunk(hunk)}
                disabled={done}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isHighContrast
                    ? 'border-2 border-[#ffffff] bg-[#000000] text-[#ffffff] hover:border-[#ffd400] hover:bg-[#ffd400] hover:text-[#000000] focus:ring-2 focus:ring-[#ffd400] focus:outline-none'
                    : 'border border-white/10 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-400'
                }`}
              >
                {done ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
                )}
                {done ? 'Applied' : 'Apply'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function applyDiffMonacoTheme(monaco: Monaco, theme: ThemeName, isHighContrast: boolean) {
  if (isHighContrast) {
    const hc = THEME_COLORS.highContrast;
    monaco.editor.defineTheme('web3-lab-diff-hc', {
      base: 'hc-black',
      inherit: true,
      rules: [
        { token: 'comment', foreground: 'b8b8b8', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ffd400', fontStyle: 'bold' },
        { token: 'string', foreground: '5cff8a' },
        { token: 'type', foreground: '70d6ff', fontStyle: 'bold' },
        { token: 'function', foreground: 'ffffff', fontStyle: 'bold' },
        {
          token: 'sorobanMacro',
          foreground: hc.interactive.primary.replace('#', ''),
          fontStyle: 'bold',
        },
        {
          token: 'sorobanType',
          foreground: hc.status.info.replace('#', ''),
          fontStyle: 'bold',
        },
      ],
      colors: {
        'editor.background': hc.background.primary,
        'editor.foreground': hc.text.primary,
        'editor.lineHighlightBackground': '#141414',
        'editor.lineHighlightBorder': '#ffffff',
        'editorLineNumber.foreground': hc.text.muted,
        'editorLineNumber.activeForeground': hc.text.primary,
        'editor.selectionHighlightBorder': hc.interactive.primary,
        contrastBorder: hc.border.dark,
        contrastActiveBorder: hc.interactive.primary,
        'diffEditor.insertedTextBackground': HIGH_CONTRAST_DIFF_COLORS.addedBackground,
        'diffEditor.removedTextBackground': HIGH_CONTRAST_DIFF_COLORS.removedBackground,
        'diffEditor.insertedLineBackground': HIGH_CONTRAST_DIFF_COLORS.addedLineBackground,
        'diffEditor.removedLineBackground': HIGH_CONTRAST_DIFF_COLORS.removedLineBackground,
        'diffEditor.insertedTextBorder': HIGH_CONTRAST_DIFF_COLORS.addedBorder,
        'diffEditor.removedTextBorder': HIGH_CONTRAST_DIFF_COLORS.removedBorder,
        'diffEditor.border': hc.border.dark,
      },
    });
    monaco.editor.setTheme('web3-lab-diff-hc');
    return;
  }

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
}

export function DiffViewer({
  original,
  modified,
  filename = 'lib.rs',
  language = 'rust',
  onApply,
  theme = 'dark',
  highContrast,
}: DiffViewerProps) {
  const themeContext = useOptionalTheme();
  const isHighContrast =
    highContrast ?? (theme === 'high-contrast' || Boolean(themeContext?.isHighContrast));

  const [sideBySide, setSideBySide] = useState(true);
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [buffer, setBuffer] = useState(original);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const monacoRef = useRef<Monaco | null>(null);

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
      monacoRef.current = monaco;
      applyDiffMonacoTheme(monaco, theme, isHighContrast);
    },
    [theme, isHighContrast],
  );

  useEffect(() => {
    if (monacoRef.current) {
      applyDiffMonacoTheme(monacoRef.current, theme, isHighContrast);
    }
  }, [theme, isHighContrast]);

  return (
    <section
      role="region"
      aria-label={`Diff viewer — ${filename}`}
      data-high-contrast={isHighContrast ? 'true' : 'false'}
      className={`flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl ${
        isHighContrast
          ? 'border-2 border-[#ffffff] bg-[#000000] text-[#ffffff]'
          : 'border border-white/10 bg-[#09090b]'
      }`}
    >
      <header
        className={`flex items-center gap-3 px-4 py-2 ${
          isHighContrast
            ? 'border-b-2 border-[#ffffff] bg-[#000000]'
            : 'border-b border-white/5 bg-black/40'
        }`}
      >
        <span
          className={`font-mono text-[11px] tracking-widest uppercase ${
            isHighContrast ? 'font-bold text-[#ffffff]' : 'text-zinc-300'
          }`}
        >
          {filename}
        </span>
        <div
          role="note"
          aria-label="Diff change legend"
          className="hidden items-center gap-2 sm:flex"
        >
          <span
            style={isHighContrast ? ADDED_PATTERN_STYLE : undefined}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              isHighContrast
                ? 'border border-solid border-[#5cff8a] bg-[#00260f] text-[#ffffff]'
                : 'border border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
            }`}
          >
            <span aria-hidden="true">{HIGH_CONTRAST_DIFF_COLORS.addedSymbol}</span>
            Added
          </span>
          <span
            style={isHighContrast ? REMOVED_PATTERN_STYLE : undefined}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              isHighContrast
                ? 'border border-dashed border-[#ff9494] bg-[#2b0000] text-[#ffffff]'
                : 'border border-red-500/40 bg-red-950/50 text-red-200'
            }`}
          >
            <span aria-hidden="true">{HIGH_CONTRAST_DIFF_COLORS.removedSymbol}</span>
            Removed
          </span>
        </div>
        <div className="flex-grow" />
        <span
          className={`text-[10px] ${
            isHighContrast ? 'font-semibold text-[#e0e0e0]' : 'text-zinc-400'
          }`}
        >
          {sideBySide ? 'Side-by-side' : 'Inline'}
        </span>
        <div
          role="group"
          aria-label="Diff view mode"
          className={`flex overflow-hidden rounded-md ${
            isHighContrast ? 'border-2 border-[#ffffff]' : 'border border-white/10'
          }`}
        >
          <button
            type="button"
            onClick={() => setSideBySide(false)}
            aria-pressed={!sideBySide}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-wider uppercase transition-colors ${
              isHighContrast
                ? !sideBySide
                  ? 'bg-[#ffd400] text-[#000000]'
                  : 'bg-[#000000] text-[#ffffff] hover:bg-[#1f1f1f]'
                : !sideBySide
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
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
              isHighContrast
                ? sideBySide
                  ? 'bg-[#ffd400] text-[#000000]'
                  : 'bg-[#000000] text-[#ffffff] hover:bg-[#1f1f1f]'
                : sideBySide
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
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
        isHighContrast={isHighContrast}
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
