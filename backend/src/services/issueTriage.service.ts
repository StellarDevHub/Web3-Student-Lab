/**
 * Issue Triage Minigame Service — Smart Contract Playground backend.
 *
 * Manages triage scenarios, scoring, and Redis-backed leaderboards.
 */

import cacheService from '../cache/CacheService.js';

export type IssuePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type IssueLabel = 'bug' | 'security' | 'documentation' | 'enhancement' | 'gas-optimization';

export interface TriageIssue {
  id: string;
  title: string;
  body: string;
  labels: IssueLabel[];
  correctPriority: IssuePriority;
  correctLabels: IssueLabel[];
  hint: string;
}

export interface TriageSubmission {
  issueId: string;
  priority: IssuePriority;
  labels: IssueLabel[];
}

export interface TriageScoreResult {
  issueId: string;
  correct: boolean;
  points: number;
  maxPoints: number;
  feedback: string;
}

export interface LeaderboardEntry {
  playerId: string;
  score: number;
  roundsCompleted: number;
  updatedAt: string;
}

const LEADERBOARD_KEY = 'playground:triage:leaderboard';
const LEADERBOARD_TTL = 86_400;

export const TRIAGE_SCENARIOS: TriageIssue[] = [
  {
    id: 'issue-001',
    title: 'Reentrancy in withdraw() allows double-spend',
    body: 'External call before balance update in withdraw function.',
    labels: ['security', 'bug'],
    correctPriority: 'P0',
    correctLabels: ['security', 'bug'],
    hint: 'Funds at risk — treat as highest priority.',
  },
  {
    id: 'issue-002',
    title: 'README missing deployment instructions',
    body: 'Contributors cannot reproduce local build steps.',
    labels: ['documentation'],
    correctPriority: 'P3',
    correctLabels: ['documentation'],
    hint: 'Docs gaps are important but rarely block production.',
  },
  {
    id: 'issue-003',
    title: 'Batch storage writes reduce gas by 18%',
    body: 'Refactor set() calls inside loop to single persist.',
    labels: ['gas-optimization', 'enhancement'],
    correctPriority: 'P2',
    correctLabels: ['gas-optimization', 'enhancement'],
    hint: 'Performance wins matter but are not emergencies.',
  },
  {
    id: 'issue-004',
    title: 'Token transfer fails for amounts > i32::MAX',
    body: 'Cast truncates large balances on transfer path.',
    labels: ['bug'],
    correctPriority: 'P1',
    correctLabels: ['bug'],
    hint: 'Functional bug without immediate exploit — high but not P0.',
  },
];

export function scoreTriageSubmission(submission: TriageSubmission): TriageScoreResult {
  const issue = TRIAGE_SCENARIOS.find((s) => s.id === submission.issueId);
  if (!issue) {
    return {
      issueId: submission.issueId,
      correct: false,
      points: 0,
      maxPoints: 100,
      feedback: 'Unknown issue ID.',
    };
  }

  const priorityCorrect = submission.priority === issue.correctPriority;
  const labelMatches = issue.correctLabels.filter((l) => submission.labels.includes(l)).length;
  const labelScore = issue.correctLabels.length > 0
    ? Math.round((labelMatches / issue.correctLabels.length) * 50)
    : 0;
  const priorityScore = priorityCorrect ? 50 : 0;
  const points = priorityScore + labelScore;
  const correct = priorityCorrect && labelMatches === issue.correctLabels.length;

  let feedback = issue.hint;
  if (correct) {
    feedback = 'Perfect triage! Priority and labels match maintainer expectations.';
  } else if (!priorityCorrect) {
    feedback = `Priority should be ${issue.correctPriority}. ${issue.hint}`;
  } else {
    feedback = `Labels incomplete. Expected: ${issue.correctLabels.join(', ')}.`;
  }

  return { issueId: submission.issueId, correct, points, maxPoints: 100, feedback };
}

export function scoreRound(submissions: TriageSubmission[]): {
  totalPoints: number;
  maxPoints: number;
  results: TriageScoreResult[];
  accuracy: number;
} {
  const results = submissions.map(scoreTriageSubmission);
  const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
  const maxPoints = results.length * 100;
  const accuracy = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  return { totalPoints, maxPoints, results, accuracy };
}

export async function updateLeaderboard(
  playerId: string,
  scoreDelta: number,
  roundsCompleted: number
): Promise<LeaderboardEntry> {
  const board = (await cacheService.get<LeaderboardEntry[]>(LEADERBOARD_KEY)) ?? [];
  const existing = board.find((e) => e.playerId === playerId);
  const entry: LeaderboardEntry = existing
    ? {
        playerId,
        score: existing.score + scoreDelta,
        roundsCompleted: existing.roundsCompleted + roundsCompleted,
        updatedAt: new Date().toISOString(),
      }
    : {
        playerId,
        score: scoreDelta,
        roundsCompleted,
        updatedAt: new Date().toISOString(),
      };

  const updated = [...board.filter((e) => e.playerId !== playerId), entry].sort(
    (a, b) => b.score - a.score
  );
  await cacheService.set(LEADERBOARD_KEY, updated.slice(0, 50), LEADERBOARD_TTL);
  return entry;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return (await cacheService.get<LeaderboardEntry[]>(LEADERBOARD_KEY)) ?? [];
}
