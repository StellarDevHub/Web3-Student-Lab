'use client';

import { useState } from 'react';
import LessonCodeEditor from './LessonCodeEditor';

/**
 * LessonWorkspace — pairs lesson content with the interactive code editor.
 *
 * Layout: on large screens the lesson content and the Monaco editor sit
 * side-by-side (two columns); on small screens they stack so the content stays
 * readable. The editor column is sticky on desktop so it remains visible while
 * the student scrolls through longer lessons.
 *
 * The component intentionally accepts the lesson body as `children`, so callers
 * can render rich content (headings, prose, code samples) however they like
 * while this component owns only the split layout and editor wiring.
 */
export interface LessonWorkspaceProps {
  /** Lesson title shown above the content column. */
  title: string;
  /** Starter code loaded into the editor. */
  starterCode: string;
  /** Editor language id (defaults to Rust). */
  language?: string;
  /** Lesson body content. */
  children: React.ReactNode;
}

export function LessonWorkspace({
  title,
  starterCode,
  language = 'rust',
  children,
}: LessonWorkspaceProps) {
  // Lift editor state so the lesson could later react to the student's code
  // (e.g. run/validate). For now it powers the "unsaved changes" hint.
  const [code, setCode] = useState(starterCode);
  const hasEdits = code !== starterCode;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Lesson content */}
      <article className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
        <h2 className="text-foreground mb-4 text-2xl font-black tracking-tight uppercase">
          {title}
        </h2>
        <div className="text-text-secondary space-y-4 text-sm leading-relaxed">{children}</div>
      </article>

      {/* Editor side-panel */}
      <div className="flex flex-col gap-2 lg:sticky lg:top-24 lg:self-start">
        <LessonCodeEditor
          initialCode={starterCode}
          language={language}
          onChange={setCode}
        />
        <p className="text-text-secondary text-right text-[11px] tracking-widest uppercase" aria-live="polite">
          {hasEdits ? 'Unsaved changes' : 'Starter code'}
        </p>
      </div>
    </div>
  );
}

export default LessonWorkspace;
