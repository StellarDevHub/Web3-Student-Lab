'use client';

import dynamic from 'next/dynamic';
import type { OnMount } from '@monaco-editor/react';
import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { extendRustLanguage } from '@/lib/editor/SorobanLanguage';
import { registerSorobanCompletion } from '@/lib/editor/SorobanCompletion';

/**
 * LessonCodeEditor — a self-contained Monaco editor for the lesson side-panel.
 *
 * Design notes:
 *  - **Bundle size**: Monaco is heavy, so `@monaco-editor/react` is pulled in via
 *    `next/dynamic` with `ssr: false`. It is never part of the server bundle and
 *    only downloads on the client when a lesson with an editor is opened.
 *  - **Rust support**: syntax highlighting and basic autocomplete are wired up by
 *    reusing the shared `extendRustLanguage` / `registerSorobanCompletion`
 *    helpers, so the lesson editor stays consistent with the playground without
 *    duplicating the language definition.
 *  - **Decoupled**: unlike the playground editor, this component has no
 *    collaboration/compile coupling. It owns a single string of code, reports
 *    changes via `onChange`, and can reset back to the lesson's starter code.
 *  - **Resilient**: if Monaco fails to load, an accessible <textarea> fallback
 *    keeps the lesson usable.
 */
export interface LessonCodeEditorProps {
  /** Starter code shown when the editor first mounts and after a reset. */
  initialCode: string;
  /** Monaco language id. Defaults to Rust, the curriculum's primary language. */
  language?: string;
  /** Filename shown in the editor header (purely cosmetic). */
  filename?: string;
  /** Called with the full editor contents whenever the code changes. */
  onChange?: (value: string) => void;
}

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full min-h-[300px] w-full items-center justify-center bg-zinc-950 text-zinc-500"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        <p className="text-xs tracking-widest uppercase">Loading editor…</p>
      </div>
    </div>
  ),
});

/** Catches Monaco runtime failures and swaps in the plain-text fallback. */
class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function FallbackTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2">
        <span className="text-xs font-bold tracking-wider text-red-400 uppercase">
          Editor unavailable — using plain text
        </span>
      </div>
      <textarea
        aria-label="Lesson code editor (fallback)"
        className="h-full w-full resize-none border-0 bg-zinc-950 p-4 font-mono text-sm text-zinc-300 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

export function LessonCodeEditor({
  initialCode,
  language = 'rust',
  filename = 'lib.rs',
  onChange,
}: LessonCodeEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [monacoError, setMonacoError] = useState(false);

  // Keep local state in sync if the lesson (and therefore its starter) changes.
  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? '';
      setCode(next);
      onChange?.(next);
    },
    [onChange]
  );

  const handleReset = useCallback(() => {
    setCode(initialCode);
    onChange?.(initialCode);
  }, [initialCode, onChange]);

  const handleMount: OnMount = useCallback((_editor, monaco) => {
    // Register Rust highlighting + basic autocomplete for the lesson editor.
    extendRustLanguage(monaco);
    registerSorobanCompletion(monaco);
  }, []);

  const isDirty = code !== initialCode;

  return (
    <section
      role="region"
      aria-label="Lesson code editor"
      className="flex h-full min-h-[300px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#09090b]"
    >
      <header className="flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-2">
        <span className="font-mono text-[11px] tracking-widest text-gray-400 uppercase">
          {filename}
        </span>
        <button
          type="button"
          onClick={handleReset}
          disabled={!isDirty}
          aria-label="Reset code to the lesson starter"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold tracking-widest text-gray-400 uppercase transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset
        </button>
      </header>

      <div className="relative flex-grow min-h-[300px]">
        {monacoError ? (
          <FallbackTextarea value={code} onChange={handleChange} />
        ) : (
          <EditorErrorBoundary onError={() => setMonacoError(true)}>
            <div className="absolute inset-0">
              <Editor
                height="100%"
                defaultLanguage={language}
                language={language}
                value={code}
                onChange={handleChange}
                onMount={handleMount}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  tabSize: 4,
                  insertSpaces: true,
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  padding: { top: 16 },
                }}
              />
            </div>
          </EditorErrorBoundary>
        )}
      </div>
    </section>
  );
}

export default LessonCodeEditor;
