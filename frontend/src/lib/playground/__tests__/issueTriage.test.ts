import { describe, it, expect } from 'vitest';
import {
  TRIAGE_ISSUES,
  scoreTriageAnswer,
  scoreTriageRound,
  toggleLabel,
} from '../issueTriage';

describe('issueTriage', () => {
  it('toggles labels', () => {
    expect(toggleLabel(['bug'], 'security')).toEqual(['bug', 'security']);
    expect(toggleLabel(['bug', 'security'], 'bug')).toEqual(['security']);
  });

  it('scores perfect triage answer', () => {
    const issue = TRIAGE_ISSUES[0];
    const result = scoreTriageAnswer(issue, {
      issueId: issue.id,
      priority: issue.correctPriority,
      labels: issue.correctLabels,
    });
    expect(result.correct).toBe(true);
    expect(result.points).toBe(100);
  });

  it('scores a full round', () => {
    const answers = TRIAGE_ISSUES.map((issue) => ({
      issueId: issue.id,
      priority: issue.correctPriority,
      labels: issue.correctLabels,
    }));
    const round = scoreTriageRound(TRIAGE_ISSUES, answers);
    expect(round.accuracy).toBe(100);
    expect(round.totalPoints).toBe(TRIAGE_ISSUES.length * 100);
  });
});
