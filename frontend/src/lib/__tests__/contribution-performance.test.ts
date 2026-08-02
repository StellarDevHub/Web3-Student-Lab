import { describe, expect, it } from 'vitest';
import {
  SAMPLE_CONTRIBUTION_EVENTS,
  buildContributionPerformanceProfile,
  type ContributionEvent,
} from '../contribution-performance';

describe('contribution performance profiling', () => {
  it('builds a healthy open source contribution profile', () => {
    const profile = buildContributionPerformanceProfile(SAMPLE_CONTRIBUTION_EVENTS, 0.95);

    expect(profile.cycleTimeHours).toBe(25);
    expect(profile.reviewResponseHours).toBe(3.9);
    expect(profile.overallScore).toBeGreaterThan(80);
    expect(profile.bottlenecks).toEqual([]);
  });

  it('flags slow reviews and repeated changes', () => {
    const events: ContributionEvent[] = [
      { id: '1', type: 'issue_assigned', timestamp: '2026-06-20T09:00:00.000Z' },
      { id: '2', type: 'review_requested', timestamp: '2026-06-20T10:00:00.000Z' },
      { id: '3', type: 'changes_requested', timestamp: '2026-06-21T10:00:00.000Z' },
      { id: '4', type: 'changes_requested', timestamp: '2026-06-22T10:00:00.000Z' },
      { id: '5', type: 'review_received', timestamp: '2026-06-22T12:00:00.000Z' },
      { id: '6', type: 'pr_merged', timestamp: '2026-06-23T12:00:00.000Z' },
    ];

    const profile = buildContributionPerformanceProfile(events, 0.7);

    expect(profile.bottlenecks).toContain('Slow review response');
    expect(profile.bottlenecks).toContain('Repeated change requests');
    expect(profile.qualityScore).toBeLessThan(80);
  });
});
