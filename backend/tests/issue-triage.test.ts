import { describe, expect, it } from '@jest/globals';
import {
  TRIAGE_SCENARIOS,
  scoreRound,
  scoreTriageSubmission,
  updateLeaderboard,
  getLeaderboard,
} from '../src/services/issueTriage.service.js';

describe('Issue Triage Service', () => {
  it('scores perfect submission', () => {
    const issue = TRIAGE_SCENARIOS[0];
    const result = scoreTriageSubmission({
      issueId: issue.id,
      priority: issue.correctPriority,
      labels: issue.correctLabels,
    });
    expect(result.correct).toBe(true);
    expect(result.points).toBe(100);
  });

  it('scores a full round', () => {
    const submissions = TRIAGE_SCENARIOS.map((issue) => ({
      issueId: issue.id,
      priority: issue.correctPriority,
      labels: issue.correctLabels,
    }));
    const round = scoreRound(submissions);
    expect(round.accuracy).toBe(100);
    expect(round.results).toHaveLength(TRIAGE_SCENARIOS.length);
  });

  it('updates and retrieves leaderboard', async () => {
    const entry = await updateLeaderboard('player-test-1', 250, 3);
    expect(entry.playerId).toBe('player-test-1');
    expect(entry.score).toBeGreaterThanOrEqual(250);

    const board = await getLeaderboard();
    expect(board.some((e) => e.playerId === 'player-test-1')).toBe(true);
  });
});
