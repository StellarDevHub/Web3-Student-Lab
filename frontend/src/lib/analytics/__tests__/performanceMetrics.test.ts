import { describe, it, expect } from 'vitest';
import {
  computeCompletionRate,
  formatDuration,
  evaluateAchievements,
  countEarnedBadges,
  type LearningMetrics,
} from '../performanceMetrics';

const base: LearningMetrics = {
  coursesCompleted: 6,
  coursesEnrolled: 12,
  totalTimeSpentMinutes: 150,
  currentStreakDays: 7,
  averageScore: 92,
};

describe('performanceMetrics', () => {
  it('computes completion rate and guards divide-by-zero', () => {
    expect(computeCompletionRate(base)).toBe(50);
    expect(computeCompletionRate({ ...base, coursesEnrolled: 0 })).toBe(0);
  });

  it('formats durations', () => {
    expect(formatDuration(150)).toBe('2h 30m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(45)).toBe('45m');
  });

  it('evaluates achievements against the metrics snapshot', () => {
    const badges = evaluateAchievements(base);
    const earned = countEarnedBadges(badges);
    expect(badges.length).toBeGreaterThan(0);
    // first-steps, halfway-there, consistent (7d), high-achiever (>=90) earned;
    // finisher (100%) and time-scholar (>=600m) not.
    expect(earned).toBe(4);
    expect(badges.find((b) => b.id === 'finisher')?.earned).toBe(false);
  });
});
