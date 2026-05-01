"use client";

import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <p className="text-xs uppercase tracking-widest">Loading Diff Engine...</p>
        </div>
      </div>
    ),
  }
);
import { useMemo, useState } from "react";

interface ReviewComment {
  id: string;
  author: string;
  line: number;
  summary: string;
  details: string;
  rebuttals: string[];
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
    id: "c1",
    author: "Peer Reviewer 1",
    line: 6,
    summary: "Avoid `panic!` for predictable submission flow.",
    details:
      "A panic in production contract code can abort the entire transaction. Use bounded results or sanitization to keep execution predictable.",
    rebuttals: [
      "The contract should avoid hard aborts for user-facing flows.",
    ],
  },
  {
    id: "c2",
    author: "Peer Reviewer 2",
    line: 11,
    summary: "Use checked multiplication to prevent overflow.",
    details:
      "The `score * 2` operation is safe for small input, but using `checked_mul` matches best practices for contract arithmetic safety.",
    rebuttals: [],
  },
  {
    id: "c3",
    author: "Peer Reviewer 3",
    line: 16,
    summary: "Trim input before validation.",
    details:
      "Empty string checks should still account for whitespace-only submissions, especially in user-provided code.",
    rebuttals: ["Great catch — I will add trimming before storing."],
  },
];

export default function PeerReviewDashboard() {
  const [comments, setComments] = useState(initialComments);
  const [activeCommentId, setActiveCommentId] = useState(initialComments[0].id);
  const [draftReply, setDraftReply] = useState("");

  const activeComment = comments.find((comment) => comment.id === activeCommentId) ?? comments[0];

  const averageScore = useMemo(() => {
    const scores = { Security: 8, Efficiency: 7, Readability: 9 };
    return Math.round(
      Object.values(scores).reduce((sum, value) => sum + value, 0) /
        Object.values(scores).length
    );
  }, []);

  const handlePublishReply = () => {
    if (!draftReply.trim()) return;
    setComments((current) =>
      current.map((comment) =>
        comment.id === activeCommentId
          ? { ...comment, rebuttals: [...comment.rebuttals, draftReply.trim()] }
          : comment
      )
    );
    setDraftReply("");
  };

  const handleDiffMount: OnMount = (editor, monaco) => {
    monaco.editor.defineTheme("web3-lab-diff", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6B7280", fontStyle: "italic" },
        { token: "keyword", foreground: "F87171", fontStyle: "bold" },
        { token: "string", foreground: "34D399" },
      ],
      colors: {
        "editor.background": "#09090b",
        "editor.lineHighlightBackground": "#111827",
        "editorCursor.foreground": "#f87171",
      },
    });

    monaco.editor.setTheme("web3-lab-diff");

    const modifiedEditor = editor.getModifiedEditor();
    const modifiedModel = modifiedEditor.getModel();
    if (modifiedModel) {
      monaco.editor.setModelMarkers(
        modifiedModel,
        "peer-review-comments",
        comments.map((comment) => ({
          startLineNumber: comment.line,
          endLineNumber: comment.line,
          message: comment.summary,
          severity: monaco.MarkerSeverity.Warning,
        }))
      );
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="flex flex-col xl:flex-row gap-6 mb-8">
          <div className="flex-1 rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl shadow-red-600/10 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.35em] text-red-400 font-black mb-2">
              Peer-Review Dashboard
            </p>
            <h1 className="text-4xl font-black text-white mb-3">
              Submission Review Workspace
            </h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              Compare the current student submission against the canonical master branch, review inline annotations, and score the submission across security,
              efficiency, and readability.
            </p>
          </div>

          <div className="w-full xl:w-[360px] rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl shadow-red-600/10 backdrop-blur-xl">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.35em] text-gray-500 font-black mb-2">
                Scorecard Overview
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10 text-red-300 text-2xl font-black">
                  {averageScore}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Average Review</p>
                  <p className="text-xs uppercase tracking-[0.35em] text-gray-500">
                    Security · Efficiency · Readability
                  </p>
                </div>
              </div>
            </div>

            {[
              { label: "Security", score: 8 },
              { label: "Efficiency", score: 7 },
              { label: "Readability", score: 9 },
            ].map((item) => (
              <div key={item.label} className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">{item.label}</span>
                  <span className="text-sm font-bold text-white">{item.score}/10</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${item.score * 10}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-xs uppercase tracking-[0.35em] text-gray-500 font-black mb-3">
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

        <div className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-white">Code Comparison</h2>
                  <p className="text-sm text-gray-400">
                    View a diff between the student submission and the master branch.
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.35em] text-gray-400">
                  Inline diff mode
                </span>
              </div>

              <div className="h-[560px] rounded-3xl overflow-hidden border border-white/10">
                <DiffEditor
                  original={masterCode}
                  modified={currentCode}
                  language="rust"
                  theme="web3-lab-diff"
                  options={{
                    renderSideBySide: true,
                    readOnly: true,
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                  onMount={handleDiffMount}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-2xl font-black text-white">Comment Threads</h2>
                  <p className="text-sm text-gray-400">Click any thread to expand details and author rebuttals.</p>
                </div>
              </div>

              <div className="space-y-4">
                {comments.map((comment) => (
                  <button
                    key={comment.id}
                    onClick={() => setActiveCommentId(comment.id)}
                    className={`w-full rounded-3xl border px-5 py-4 text-left transition-all ${
                      comment.id === activeCommentId
                        ? "border-red-500/40 bg-red-500/10 shadow-[0_0_30px_rgba(248,113,113,0.12)]"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-gray-400 uppercase tracking-[0.25em] font-bold">
                          Line {comment.line}
                        </p>
                        <p className="text-lg font-bold text-white">{comment.summary}</p>
                      </div>
                      <span className="text-xs uppercase tracking-[0.35em] text-red-400 font-black">
                        {comment.author}
                      </span>
                    </div>
                    {comment.id === activeCommentId && (
                      <div className="mt-4 text-sm text-gray-300 leading-relaxed">
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
              <h2 className="text-2xl font-black text-white mb-4">Selected Comment</h2>
              <p className="text-sm text-gray-400 mb-4">{activeComment.details}</p>
              <div className="space-y-4">
                <div className="rounded-3xl bg-white/5 p-4 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.35em] text-gray-500 font-bold mb-2">
                    Rebuttal Threads
                  </p>
                  {activeComment.rebuttals.length > 0 ? (
                    <div className="space-y-3">
                      {activeComment.rebuttals.map((reply, index) => (
                        <p key={index} className="text-sm text-gray-300 bg-white/5 p-3 rounded-2xl border border-white/10">
                          {reply}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No rebuttal yet. Encourage the author to respond.</p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-[0.35em] text-gray-500 font-black">
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
                    className="w-full rounded-3xl bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-[0.25em] text-white transition hover:bg-red-500"
                  >
                    Post Rebuttal
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
              <h2 className="text-2xl font-black text-white mb-4">Review Controls</h2>
              <div className="space-y-4 text-sm text-gray-300">
                <div className="rounded-3xl bg-white/5 p-4 border border-white/10">
                  <p className="font-semibold text-white mb-2">Reviewer Actions</p>
                  <p>Use the inline comment summary panel to keep review focus aligned with code changes.</p>
                </div>
                <div className="rounded-3xl bg-white/5 p-4 border border-white/10">
                  <p className="font-semibold text-white mb-2">Author Flow</p>
                  <p>Authors can reply directly to comments and keep rebuttals linked to the same review thread.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
