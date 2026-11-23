export type ContributionEventType =
  | 'issue_assigned'
  | 'branch_created'
  | 'commit_pushed'
  | 'pr_opened'
  | 'review_requested'
  | 'review_received'
  | 'changes_requested'
  | 'pr_merged';

export interface ContributionEvent {
  id: string;
  type: ContributionEventType;
  timestamp: string;
}

export interface ContributionProfile {
  cycleTimeHours: number;
  reviewResponseHours: number;
  throughputScore: number;
  qualityScore: number;
  focusScore: number;
  overallScore: number;
  bottlenecks: string[];
  recommendations: string[];
}

const HOURS = 1000 * 60 * 60;

function hoursBetween(start?: ContributionEvent, end?: ContributionEvent): number {
  if (!start || !end) return 0;
  const diff = new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime();
  return Math.max(0, Math.round((diff / HOURS) * 10) / 10);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildContributionPerformanceProfile(
  events: ContributionEvent[],
  testPassRate = 1
): ContributionProfile {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const first = sorted[0];
  const merged = sorted.find((event) => event.type === 'pr_merged');
  const reviewRequested = sorted.find((event) => event.type === 'review_requested');
  const reviewReceived = sorted.find((event) => event.type === 'review_received');
  const changesRequested = sorted.filter((event) => event.type === 'changes_requested').length;
  const commits = sorted.filter((event) => event.type === 'commit_pushed').length;

  const cycleTimeHours = hoursBetween(first, merged ?? sorted[sorted.length - 1]);
  const reviewResponseHours = hoursBetween(reviewRequested, reviewReceived);
  const throughputScore = clampScore(100 - cycleTimeHours * 2);
  const qualityScore = clampScore(testPassRate * 100 - changesRequested * 15);
  const focusScore = clampScore(100 - Math.max(0, commits - 5) * 8);
  const overallScore = clampScore((throughputScore + qualityScore + focusScore) / 3);

  const bottlenecks: string[] = [];
  if (cycleTimeHours > 36) bottlenecks.push('Long issue-to-merge cycle time');
  if (reviewResponseHours > 12) bottlenecks.push('Slow review response');
  if (changesRequested > 1) bottlenecks.push('Repeated change requests');
  if (commits > 8) bottlenecks.push('Large PR scope');

  const recommendations = [
    cycleTimeHours > 36 ? 'Break future issues into smaller PRs.' : 'Keep PR size focused.',
    reviewResponseHours > 12 ? 'Respond to reviews within one working session.' : 'Review response time is healthy.',
    qualityScore < 80 ? 'Run tests before requesting review.' : 'Quality signals look strong.',
  ];

  return {
    cycleTimeHours,
    reviewResponseHours,
    throughputScore,
    qualityScore,
    focusScore,
    overallScore,
    bottlenecks,
    recommendations,
  };
}

export const SAMPLE_CONTRIBUTION_EVENTS: ContributionEvent[] = [
  { id: '1', type: 'issue_assigned', timestamp: '2026-06-20T09:00:00.000Z' },
  { id: '2', type: 'branch_created', timestamp: '2026-06-20T09:20:00.000Z' },
  { id: '3', type: 'commit_pushed', timestamp: '2026-06-20T11:00:00.000Z' },
  { id: '4', type: 'pr_opened', timestamp: '2026-06-20T13:00:00.000Z' },
  { id: '5', type: 'review_requested', timestamp: '2026-06-20T13:05:00.000Z' },
  { id: '6', type: 'review_received', timestamp: '2026-06-20T17:00:00.000Z' },
  { id: '7', type: 'pr_merged', timestamp: '2026-06-21T10:00:00.000Z' },
];
