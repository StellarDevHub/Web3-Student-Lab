'use client';

import { registerSorobanCompletion } from '@/lib/editor/SorobanCompletion';
import { registerSorobanHover } from '@/lib/editor/SorobanHover';
import {
    SOROBAN_LANGUAGE_ID,
    registerSorobanCodeActions,
    registerSorobanLanguage,
} from '@/lib/editor/SorobanLanguage';
import type { DiffOnMount } from '@monaco-editor/react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';

const DiffEditor = dynamic(() => import('@monaco-editor/react').then((mod) => mod.DiffEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
        <p className="text-xs tracking-widest uppercase">Loading Diff Engine...</p>
      </div>
    </div>
  ),
});

interface ReviewComment {
  id: string;
  author: string;
  line: number;
  summary: string;
  details: string;
  rebuttals: string[];
}

const RUBRIC_CRITERIA = [
  { key: 'security', label: 'Security', weight: 35 },
  { key: 'correctness', label: 'Correctness', weight: 30 },
  { key: 'validation', label: 'Input validation', weight: 20 },
  { key: 'maintainability', label: 'Maintainability', weight: 15 },
] as const;

type RubricKey = (typeof RUBRIC_CRITERIA)[number]['key'];

interface GradeCheck {
  criterion: RubricKey;
  label: string;
  passed: boolean;
}

const currentCode = `use soroban_sdk::{contractimpl, Env, Symbol};

pub struct StudentContract;

#[contractimpl]
impl StudentContract {
    pub fn grade_submission(env: Env, score: i32) -> i32 {
        env.log(&Symbol::new("grading"));
        let adjusted = score * 2;

        if adjusted > 100 {
            panic!("Score exceeds allowed maximum");
        }

        adjusted
    }

    pub fn submit_code(env: Env, code: String) -> bool {
        if code.is_empty() {
            return false;
        }

        env.storage().set(&Symbol::new("last_submission"), &code);
        true
    }
}
`;

const masterCode = `use soroban_sdk::{contractimpl, Env, Symbol};

pub struct StudentContract;

#[contractimpl]
impl StudentContract {
    pub fn grade_submission(env: Env, score: i32) -> i32 {
        let adjusted = score.checked_mul(2).unwrap_or(0);

        if adjusted > 100 {
            return 100;
        }

        adjusted
    }

    pub fn submit_code(env: Env, code: String) -> bool {
        if code.trim().is_empty() {
            return false;
        }

        env.storage().set(&Symbol::new("last_submission"), &code);
        true
    }
}
`;

const initialComments: ReviewComment[] = [
  {
    id: 'c1',
    author: 'Peer Reviewer 1',
    line: 6,
    summary: 'Avoid `panic!` for predictable submission flow.',
    details:
      'A panic in production contract code can abort the entire transaction. Use bounded results or sanitization to keep execution predictable.',
    rebuttals: ['The contract should avoid hard aborts for user-facing flows.'],
  },
  {
    id: 'c2',
    author: 'Peer Reviewer 2',
    line: 11,
    summary: 'Use checked multiplication to prevent overflow.',
    details:
      'The `score * 2` operation is safe for small input, but using `checked_mul` matches best practices for contract arithmetic safety.',
    rebuttals: [],
  },
  {
    id: 'c3',
    author: 'Peer Reviewer 3',
    line: 16,
    summary: 'Trim input before validation.',
    details:
      'Empty string checks should still account for whitespace-only submissions, especially in user-provided code.',
    rebuttals: ['Great catch — I will add trimming before storing.'],
  },
];

function evaluateSubmission(code: string): GradeCheck[] {
  return [
    { criterion: 'security', label: 'Avoids panic-based control flow', passed: !/\bpanic!\s*\(/.test(code) },
    { criterion: 'security', label: 'Uses checked arithmetic', passed: /checked_(mul|add|sub)/.test(code) },
    { criterion: 'correctness', label: 'Bounds the maximum score', passed: /if\s+adjusted\s*>\s*100[\s\S]*?return\s+100/.test(code) },
    { criterion: 'correctness', label: 'Rejects invalid submissions', passed: /if\s+code\.(trim\(\)\.)?is_empty\(\)[\s\S]*?return\s+false/.test(code) },
    { criterion: 'validation', label: 'Trims input before empty checks', passed: /code\.trim\(\)\.is_empty\(\)/.test(code) },
    { criterion: 'validation', label: 'Validates before storing input', passed: /is_empty\(\)[\s\S]*?storage\(\)\.set/.test(code) },
    { criterion: 'maintainability', label: 'Uses descriptive function names', passed: /fn\s+(grade_submission|submit_code)\b/.test(code) },
    { criterion: 'maintainability', label: 'Documents public entry points', passed: /\/\/\/[^\n]*\n\s*pub\s+fn/.test(code) },
  ];
}

export default function PeerReviewDashboard() {
  const [comments, setComments] = useState(initialComments);
  const [activeCommentId, setActiveCommentId] = useState(initialComments[0].id);
  const [draftReply, setDraftReply] = useState('');
  const [submissionCode, setSubmissionCode] = useState(currentCode);
  const [scores, setScores] = useState<Record<RubricKey, number>>({
    security: 8,
    correctness: 7,
    validation: 7,
    maintainability: 9,
  });
  const [gradeChecks, setGradeChecks] = useState<GradeCheck[] | null>(null);
  const [newCommentLine, setNewCommentLine] = useState<number | null>(null);
  const [newCommentSummary, setNewCommentSummary] = useState('');
  const [newCommentDetails, setNewCommentDetails] = useState('');
  const [editorMounted, setEditorMounted] = useState(false);
  const editorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<DiffOnMount>[1] | null>(null);
  const gutterClickRef = useRef<{ dispose: () => void } | null>(null);

  const activeComment = comments.find((comment) => comment.id === activeCommentId) ?? comments[0];

  const averageScore = useMemo(() => {
    const weightedScore = RUBRIC_CRITERIA.reduce(
      (sum, criterion) => sum + scores[criterion.key] * criterion.weight,
      0
    );
    return Math.round(weightedScore) / 100;
  }, [scores]);

  useEffect(() => {
    const modifiedModel = editorRef.current?.getModel()?.modified;
    if (!modifiedModel || !monacoRef.current) return;

    monacoRef.current.editor.setModelMarkers(
      modifiedModel,
      'peer-review-comments',
      comments
        .filter((comment) => comment.line <= modifiedModel.getLineCount())
        .map((comment) => ({
          startLineNumber: comment.line,
          endLineNumber: comment.line,
          message: comment.summary,
          severity: monacoRef.current!.MarkerSeverity.Warning,
        }))
    );
  }, [comments, editorMounted]);

  useEffect(() => () => gutterClickRef.current?.dispose(), []);

  const runAutomatedGrade = () => {
    const checks = evaluateSubmission(submissionCode);
    setGradeChecks(checks);
    setScores(
      Object.fromEntries(
        RUBRIC_CRITERIA.map((criterion) => {
          const criterionChecks = checks.filter((check) => check.criterion === criterion.key);
          const passedChecks = criterionChecks.filter((check) => check.passed).length;
          return [criterion.key, Math.round((passedChecks / criterionChecks.length) * 10)];
        })
      ) as Record<RubricKey, number>
    );
  };

  const addInlineComment = () => {
    if (newCommentLine === null || !newCommentSummary.trim() || !newCommentDetails.trim()) return;
    const comment: ReviewComment = {
      id: `comment-${Date.now()}`,
      author: 'Stellar Lead',
      line: newCommentLine,
      summary: newCommentSummary.trim(),
      details: newCommentDetails.trim(),
      rebuttals: [],
    };
    setComments((current) => [...current, comment]);
    setActiveCommentId(comment.id);
    setNewCommentLine(null);
    setNewCommentSummary('');
    setNewCommentDetails('');
  };

  const handlePublishReply = () => {
    if (!draftReply.trim()) return;
    setComments((current) =>
      current.map((comment) =>
        comment.id === activeCommentId
          ? { ...comment, rebuttals: [...comment.rebuttals, draftReply.trim()] }
          : comment
      )
    );
    setDraftReply('');
  };

  const handleDiffMount: DiffOnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    monaco.editor.defineTheme('web3-lab-diff', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'F87171', fontStyle: 'bold' },
        { token: 'annotation', foreground: 'F59E0B', fontStyle: 'bold' },
        { token: 'annotation.soroban', foreground: 'F59E0B', fontStyle: 'bold' },
        { token: 'macro', foreground: 'F59E0B', fontStyle: 'bold' },
        { token: 'string', foreground: '34D399' },
      ],
      colors: {
        'editor.background': '#09090b',
        'editor.lineHighlightBackground': '#111827',
        'editorCursor.foreground': '#f87171',
      },
    });

    monaco.editor.setTheme('web3-lab-diff');

    const modifiedEditor = editor.getModifiedEditor();
    const gutterClick = modifiedEditor.onMouseDown(({ target, event }) => {
      const line = target.position?.lineNumber;
      if (
        !line ||
        (target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS &&
          target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN)
      ) {
        return;
      }
      setNewCommentLine(line);
      setNewCommentSummary('');
      setNewCommentDetails('');
    });
    const modelChange = modifiedEditor.onDidChangeModelContent(() => {
      setSubmissionCode(modifiedEditor.getValue());
    });
    gutterClickRef.current = {
      dispose: () => {
        gutterClick.dispose();
        modelChange.dispose();
      },
    };
    setEditorMounted(true);
  };

  return (
    <div className="min-h-screen bg-black pb-16 text-white">
      <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-6 xl:flex-row">
          <div className="flex-1 rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl shadow-red-600/10 backdrop-blur-xl">
            <p className="mb-2 text-xs font-black tracking-[0.35em] text-red-400 uppercase">
              Peer-Review Dashboard
            </p>
            <h1 className="mb-3 text-4xl font-black text-white">Submission Review Workspace</h1>
            <p className="text-sm leading-relaxed text-gray-400">
              Compare the current student submission against the canonical master branch, review
              inline annotations, and score the submission across security, efficiency, and
              readability.
            </p>
          </div>

          <div className="w-full rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl shadow-red-600/10 backdrop-blur-xl xl:w-[360px]">
            <div className="mb-6">
              <p className="mb-2 text-xs font-black tracking-[0.35em] text-gray-500 uppercase">
                Scorecard Overview
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10 text-2xl font-black text-red-300">
                  {averageScore.toFixed(1)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Weighted grade / 10</p>
                  <p className="text-xs tracking-[0.35em] text-gray-500 uppercase">
                    Automated rubric
                  </p>
                </div>
              </div>
            </div>

            {RUBRIC_CRITERIA.map((item) => (
              <div key={item.label} className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-300">{item.label}</span>
                  <span className="text-sm font-bold text-white">{scores[item.key]}/10</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={scores[item.key]}
                  aria-label={`${item.label} score`}
                  onChange={(event) =>
                    setScores((current) => ({ ...current, [item.key]: Number(event.target.value) }))
                  }
                  className="h-2 w-full cursor-pointer accent-red-500"
                />
                <div className="text-right text-[10px] text-gray-500">{item.weight}% weight</div>
              </div>
            ))}

            <button
              type="button"
              onClick={runAutomatedGrade}
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500"
            >
              Run automated grade
            </button>
            {gradeChecks && (
              <div className="mt-4 space-y-2 border-t border-white/10 pt-4" aria-live="polite">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Static checks
                </p>
                {gradeChecks.map((check) => (
                  <p key={check.label} className="flex items-center gap-2 text-xs text-gray-300">
                    <span className={check.passed ? 'text-green-400' : 'text-red-400'}>
                      {check.passed ? 'Pass' : 'Flag'}
                    </span>
                    {check.label}
                  </p>
                ))}
              </div>
            )}

            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="mb-3 text-xs font-black tracking-[0.35em] text-gray-500 uppercase">
                Review Summary
              </p>
              <div className="space-y-3 text-sm text-gray-300">
                <p>
                  Reviewer: <strong className="text-white">Stellar Lead</strong>
                </p>
                <p>
                  Submission ID: <strong className="text-white">SR-0762</strong>
                </p>
                <p>Author rebuttals are tracked inline for each comment thread.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.8fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">Code Comparison</h2>
                  <p className="text-sm text-gray-400">
                    Edit the submission, compare it with the master, and select a modified line gutter to comment.
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs tracking-[0.35em] text-gray-400 uppercase">
                  Split diff
                </span>
              </div>

              <div className="h-[560px] overflow-hidden rounded-3xl border border-white/10">
                <DiffEditor
                  original={masterCode}
                  modified={submissionCode}
                  language={SOROBAN_LANGUAGE_ID}
                  beforeMount={(monaco) => {
                    registerSorobanLanguage(monaco);
                    registerSorobanCompletion(monaco);
                    registerSorobanHover(monaco);
                    registerSorobanCodeActions(monaco);
                  }}
                  theme="web3-lab-diff"
                  options={{
                    renderSideBySide: true,
                    originalEditable: false,
                    readOnly: false,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    glyphMargin: true,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                  onMount={handleDiffMount}
                />
              </div>
              {newCommentLine !== null && (
                <form
                  className="mt-4 space-y-3 border-l-2 border-red-500 pl-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addInlineComment();
                  }}
                >
                  <p className="text-sm font-semibold text-white">Comment on line {newCommentLine}</p>
                  <input
                    value={newCommentSummary}
                    onChange={(event) => setNewCommentSummary(event.target.value)}
                    placeholder="Finding summary"
                    aria-label="Finding summary"
                    className="w-full rounded border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-red-500"
                    required
                  />
                  <textarea
                    value={newCommentDetails}
                    onChange={(event) => setNewCommentDetails(event.target.value)}
                    placeholder="Explain the issue or suggestion"
                    aria-label="Comment details"
                    className="w-full resize-y rounded border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-red-500"
                    rows={3}
                    required
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setNewCommentLine(null)}
                      className="rounded border border-white/15 px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
                    >
                      Add comment
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">Comment Threads</h2>
                  <p className="text-sm text-gray-400">
                    Click any thread to expand details and author rebuttals.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {comments.map((comment) => (
                  <button
                    key={comment.id}
                    onClick={() => {
                      setActiveCommentId(comment.id);
                      editorRef.current?.getModifiedEditor().revealLineInCenter(comment.line);
                    }}
                    className={`w-full rounded-3xl border px-5 py-4 text-left transition-all ${
                      comment.id === activeCommentId
                        ? 'border-red-500/40 bg-red-500/10 shadow-[0_0_30px_rgba(248,113,113,0.12)]'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold tracking-[0.25em] text-gray-400 uppercase">
                          Line {comment.line}
                        </p>
                        <p className="text-lg font-bold text-white">{comment.summary}</p>
                      </div>
                      <span className="text-xs font-black tracking-[0.35em] text-red-400 uppercase">
                        {comment.author}
                      </span>
                    </div>
                    {comment.id === activeCommentId && (
                      <div className="mt-4 text-sm leading-relaxed text-gray-300">
                        {comment.details}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
              <h2 className="mb-4 text-2xl font-black text-white">Selected Comment</h2>
              <p className="mb-4 text-sm text-gray-400">{activeComment.details}</p>
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-2 text-xs font-bold tracking-[0.35em] text-gray-500 uppercase">
                    Rebuttal Threads
                  </p>
                  {activeComment.rebuttals.length > 0 ? (
                    <div className="space-y-3">
                      {activeComment.rebuttals.map((reply, index) => (
                        <p
                          key={index}
                          className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-gray-300"
                        >
                          {reply}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">
                      No rebuttal yet. Encourage the author to respond.
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black tracking-[0.35em] text-gray-500 uppercase">
                    Author Rebuttal
                  </label>
                  <textarea
                    value={draftReply}
                    onChange={(event) => setDraftReply(event.target.value)}
                    rows={5}
                    className="w-full resize-none rounded-3xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-sm text-white outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10"
                    placeholder="Reply to this review comment..."
                  />
                  <button
                    onClick={handlePublishReply}
                    className="w-full rounded-3xl bg-red-600 px-4 py-3 text-sm font-black tracking-[0.25em] text-white uppercase transition hover:bg-red-500"
                  >
                    Post Rebuttal
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
              <h2 className="mb-4 text-2xl font-black text-white">Review Controls</h2>
              <div className="space-y-4 text-sm text-gray-300">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-2 font-semibold text-white">Reviewer Actions</p>
                  <p>
                    Use the inline comment summary panel to keep review focus aligned with code
                    changes.
                  </p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-2 font-semibold text-white">Author Flow</p>
                  <p>
                    Authors can reply directly to comments and keep rebuttals linked to the same
                    review thread.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
