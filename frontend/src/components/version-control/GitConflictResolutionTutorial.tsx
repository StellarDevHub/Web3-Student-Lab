'use client';

import { useMemo, useState } from 'react';

const CONFLICT_SNIPPET = `function calculateReward(points) {
<<<<<<< HEAD
  return points * 2;
=======
  return Math.round(points * 2.5);
>>>>>>> feature/reward-multiplier
}`;

const ACCEPT_MINE = `function calculateReward(points) {
  return points * 2;
}`;

const ACCEPT_THEIRS = `function calculateReward(points) {
  return Math.round(points * 2.5);
}`;

const ACCEPT_BOTH = `function calculateReward(points) {
  const baseReward = points * 2;
  return Math.max(baseReward, Math.round(points * 2.5));
}`;

const REQUIRED_MARKERS = ['<<<<<<<', '=======', '>>>>>>>'] as const;

type ResolutionStatus = 'idle' | 'passed' | 'failed';

export interface ResolutionValidation {
  passed: boolean;
  reason: string;
}

export function validateConflictResolution(input: string): ResolutionValidation {
  const normalized = input.trim();
  if (!normalized) {
    return { passed: false, reason: 'Add your resolved code before validating.' };
  }

  const hasMarkers = REQUIRED_MARKERS.some((marker) => normalized.includes(marker));
  if (hasMarkers) {
    return {
      passed: false,
      reason: 'Conflict markers are still present. Remove <<<<<<<, =======, and >>>>>>> lines.',
    };
  }

  if (!normalized.includes('calculateReward')) {
    return {
      passed: false,
      reason: 'The function signature was removed. Keep calculateReward(points) in the final result.',
    };
  }

  const keepsKnownLogic =
    normalized.includes('points * 2') || normalized.includes('Math.round(points * 2.5)');

  if (!keepsKnownLogic) {
    return {
      passed: false,
      reason: 'Expected reward logic is missing. Keep at least one valid branch of the implementation.',
    };
  }

  return {
    passed: true,
    reason: 'Great work. You removed all markers and kept a valid implementation.',
  };
}

export function GitConflictResolutionTutorial() {
  const [draft, setDraft] = useState(CONFLICT_SNIPPET);
  const [status, setStatus] = useState<ResolutionStatus>('idle');
  const [feedback, setFeedback] = useState('');
  const [attempts, setAttempts] = useState(0);

  const markerChecklist = useMemo(
    () =>
      REQUIRED_MARKERS.map((marker) => ({
        marker,
        cleared: !draft.includes(marker),
      })),
    [draft]
  );

  const handleValidate = () => {
    const result = validateConflictResolution(draft);
    setAttempts((count) => count + 1);
    setStatus(result.passed ? 'passed' : 'failed');
    setFeedback(result.reason);
  };

  const applyExample = (example: string) => {
    setDraft(example);
    setStatus('idle');
    setFeedback('');
  };

  const resetScenario = () => {
    setDraft(CONFLICT_SNIPPET);
    setStatus('idle');
    setFeedback('');
    setAttempts(0);
  };

  return (
    <section className="rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-100 p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">
          Open Source Contribution Trainer
        </p>
        <h2 className="text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl">
          Git Conflict Resolution Sandbox
        </h2>
        <p className="max-w-3xl text-sm text-zinc-700 sm:text-base">
          Practice identifying and removing merge markers. Keep only the final code you want to ship.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="rounded-2xl border border-zinc-900/10 bg-zinc-950 p-3 shadow-inner sm:p-4">
          <label htmlFor="conflict-editor" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Merge File Preview
          </label>
          <textarea
            id="conflict-editor"
            data-testid="conflict-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="h-72 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs leading-6 text-zinc-100 outline-none ring-0 focus:border-amber-400 sm:h-80 sm:text-sm"
            spellCheck={false}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyExample(ACCEPT_MINE)}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600"
            >
              Accept Current Branch
            </button>
            <button
              type="button"
              onClick={() => applyExample(ACCEPT_THEIRS)}
              className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-600"
            >
              Accept Incoming Branch
            </button>
            <button
              type="button"
              onClick={() => applyExample(ACCEPT_BOTH)}
              className="rounded-lg bg-fuchsia-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-fuchsia-700"
            >
              Merge Both Ideas
            </button>
            <button
              type="button"
              onClick={resetScenario}
              className="rounded-lg border border-zinc-400/40 bg-white px-3 py-2 text-xs font-bold text-zinc-800 transition hover:bg-zinc-100"
            >
              Reset Scenario
            </button>
          </div>
        </div>

        <aside className="space-y-3 rounded-2xl border border-zinc-900/10 bg-white/90 p-4 shadow-sm sm:p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-900">
            Resolution Checklist
          </h3>
          <ul className="space-y-2" role="list">
            {markerChecklist.map(({ marker, cleared }) => (
              <li
                key={marker}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  cleared
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
                }`}
              >
                {cleared ? 'Cleared' : 'Still present'}: {marker}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleValidate}
            className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-zinc-700"
          >
            Validate Resolution
          </button>

          <p className="text-xs text-zinc-600" data-testid="attempt-count">
            Attempts: {attempts}
          </p>

          {status !== 'idle' && (
            <div
              data-testid="resolution-status"
              role={status === 'passed' ? 'status' : 'alert'}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                status === 'passed'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-red-300 bg-red-50 text-red-900'
              }`}
            >
              {feedback}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
