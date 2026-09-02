'use client';

import { useMachine } from '@xstate/react';
import issueTriageMachine from '@/lib/playground/issueTriageMachine';
import { ISSUE_LABELS, ISSUE_PRIORITIES, TRIAGE_ISSUES } from '@/lib/playground/issueTriage';
import type { IssueLabel, IssuePriority } from '@/lib/playground/issueTriage';

export default function IssueTriageMinigame() {
  const [state, send] = useMachine(issueTriageMachine);
  const issue = TRIAGE_ISSUES[state.context.currentIndex];

  if (state.matches('idle')) {
    return (
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-8 text-center">
        <h2 className="text-foreground mb-4 text-2xl font-black uppercase">Issue Triage Minigame</h2>
        <p className="text-text-secondary mb-6 text-sm">
          Practice prioritizing and labelling GitHub issues like a smart-contract maintainer.
        </p>
        <button
          type="button"
          onClick={() => send({ type: 'START' })}
          className="rounded-lg bg-red-600 px-6 py-3 text-sm font-bold tracking-widest text-white uppercase"
        >
          Start Round
        </button>
      </div>
    );
  }

  if (state.matches('complete')) {
    const maxPoints = TRIAGE_ISSUES.length * 100;
    return (
      <div className="bg-bg-secondary border-border-theme rounded-2xl border p-8 text-center">
        <h2 className="text-foreground mb-2 text-2xl font-black uppercase">Round Complete</h2>
        <p className="text-4xl font-black text-red-500">{state.context.totalPoints}/{maxPoints}</p>
        <p className="text-text-secondary mt-2 text-sm">
          Accuracy: {Math.round((state.context.totalPoints / maxPoints) * 100)}%
        </p>
        <button
          type="button"
          onClick={() => send({ type: 'RESTART' })}
          className="mt-6 rounded-lg border border-red-500 px-6 py-3 text-sm font-bold tracking-widest uppercase"
        >
          Play Again
        </button>
      </div>
    );
  }

  if (!issue) return null;

  return (
    <div className="bg-bg-secondary border-border-theme space-y-6 rounded-2xl border p-6">
      <div className="flex items-center justify-between">
        <span className="text-text-secondary text-xs font-bold tracking-widest uppercase">
          Issue {state.context.currentIndex + 1} / {TRIAGE_ISSUES.length}
        </span>
        <span className="font-mono text-sm">Score: {state.context.totalPoints}</span>
      </div>

      {state.matches('question') && (
        <>
          <div>
            <h3 className="text-foreground text-lg font-bold">{issue.title}</h3>
            <p className="text-text-secondary mt-2 text-sm">{issue.body}</p>
          </div>

          <fieldset>
            <legend className="text-text-secondary mb-2 text-xs font-bold tracking-widest uppercase">Priority</legend>
            <div className="flex flex-wrap gap-2">
              {ISSUE_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={state.context.selectedPriority === p}
                  onClick={() => send({ type: 'SET_PRIORITY', priority: p as IssuePriority })}
                  className={`rounded-lg border px-4 py-2 text-sm font-bold ${
                    state.context.selectedPriority === p ? 'border-red-500 bg-red-500/20' : 'border-white/20'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-text-secondary mb-2 text-xs font-bold tracking-widest uppercase">Labels</legend>
            <div className="flex flex-wrap gap-2">
              {ISSUE_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={state.context.selectedLabels.includes(label)}
                  onClick={() => send({ type: 'TOGGLE_LABEL', label: label as IssueLabel })}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    state.context.selectedLabels.includes(label) ? 'border-red-500 bg-red-500/20' : 'border-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={() => send({ type: 'SUBMIT' })}
            disabled={!state.context.selectedPriority || state.context.selectedLabels.length === 0}
            className="w-full rounded-lg bg-red-600 py-3 text-sm font-bold tracking-widest text-white uppercase disabled:opacity-40"
          >
            Submit Triage
          </button>
        </>
      )}

      {state.matches('feedback') && state.context.lastResult && (
        <div role="status" className="space-y-4">
          <p className={`text-lg font-bold ${state.context.lastResult.correct ? 'text-green-400' : 'text-yellow-400'}`}>
            +{state.context.lastResult.points} pts — {state.context.feedback}
          </p>
          <button
            type="button"
            onClick={() => send({ type: 'NEXT' })}
            className="w-full rounded-lg border border-red-500 py-3 text-sm font-bold tracking-widest uppercase"
          >
            {state.context.currentIndex + 1 < TRIAGE_ISSUES.length ? 'Next Issue' : 'See Results'}
          </button>
        </div>
      )}
    </div>
  );
}
