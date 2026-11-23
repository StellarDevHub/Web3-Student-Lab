/**
 * Issue Triage Minigame — Smart Contract Playground pure logic & scenarios.
 */

export type IssuePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type IssueLabel =
  | 'bug'
  | 'security'
  | 'documentation'
  | 'enhancement'
  | 'gas-optimization';

export interface TriageIssue {
  id: string;
  title: string;
  body: string;
  labels: IssueLabel[];
  correctPriority: IssuePriority;
  correctLabels: IssueLabel[];
  hint: string;
}

export interface TriageAnswer {
  issueId: string;
  priority: IssuePriority;
  labels: IssueLabel[];
}

export interface TriageResult {
  issueId: string;
  correct: boolean;
  points: number;
  maxPoints: number;
  feedback: string;
}

export const ISSUE_PRIORITIES: IssuePriority[] = ['P0', 'P1', 'P2', 'P3'];
export const ISSUE_LABELS: IssueLabel[] = [
  'bug',
  'security',
  'documentation',
  'enhancement',
  'gas-optimization',
];

export const TRIAGE_ISSUES: TriageIssue[] = [
  {
    id: 'issue-001',
    title: 'Reentrancy in withdraw() allows double-spend',
    body: 'External call before balance update in withdraw function.',
    labels: ['security', 'bug'],
    correctPriority: 'P0',
    correctLabels: ['security', 'bug'],
    hint: 'Funds at risk — highest priority.',
  },
  {
    id: 'issue-002',
    title: 'README missing deployment instructions',
    body: 'Contributors cannot reproduce local build steps.',
    labels: ['documentation'],
    correctPriority: 'P3',
    correctLabels: ['documentation'],
    hint: 'Documentation gaps are lower urgency.',
  },
  {
    id: 'issue-003',
    title: 'Batch storage writes reduce gas by 18%',
    body: 'Refactor set() calls inside loop to single persist.',
    labels: ['gas-optimization', 'enhancement'],
    correctPriority: 'P2',
    correctLabels: ['gas-optimization', 'enhancement'],
    hint: 'Optimization is valuable but not urgent.',
  },
  {
    id: 'issue-004',
    title: 'Token transfer fails for amounts > i32::MAX',
    body: 'Cast truncates large balances on transfer path.',
    labels: ['bug'],
    correctPriority: 'P1',
    correctLabels: ['bug'],
    hint: 'Functional bug without immediate exploit.',
  },
];

export function toggleLabel(labels: IssueLabel[], label: IssueLabel): IssueLabel[] {
  return labels.includes(label) ? labels.filter((l) => l !== label) : [...labels, label];
}

export function scoreTriageAnswer(issue: TriageIssue, answer: TriageAnswer): TriageResult {
  const priorityCorrect = answer.priority === issue.correctPriority;
  const matched = issue.correctLabels.filter((l) => answer.labels.includes(l)).length;
  const labelScore =
    issue.correctLabels.length > 0
      ? Math.round((matched / issue.correctLabels.length) * 50)
      : 0;
  const priorityScore = priorityCorrect ? 50 : 0;
  const points = priorityScore + labelScore;
  const correct = priorityCorrect && matched === issue.correctLabels.length;

  let feedback = issue.hint;
  if (correct) {
    feedback = 'Perfect triage!';
  } else if (!priorityCorrect) {
    feedback = `Expected priority ${issue.correctPriority}. ${issue.hint}`;
  } else {
    feedback = `Missing labels: ${issue.correctLabels.filter((l) => !answer.labels.includes(l)).join(', ')}`;
  }

  return { issueId: issue.id, correct, points, maxPoints: 100, feedback };
}

export function scoreTriageRound(
  issues: TriageIssue[],
  answers: TriageAnswer[]
): { results: TriageResult[]; totalPoints: number; maxPoints: number; accuracy: number } {
  const results = issues.map((issue) => {
    const answer = answers.find((a) => a.issueId === issue.id);
    if (!answer) {
      return {
        issueId: issue.id,
        correct: false,
        points: 0,
        maxPoints: 100,
        feedback: 'No answer submitted.',
      };
    }
    return scoreTriageAnswer(issue, answer);
  });

  const totalPoints = results.reduce((s, r) => s + r.points, 0);
  const maxPoints = results.length * 100;
  const accuracy = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  return { results, totalPoints, maxPoints, accuracy };
}

export function getIssueByIndex(index: number): TriageIssue | null {
  return TRIAGE_ISSUES[index] ?? null;
}
