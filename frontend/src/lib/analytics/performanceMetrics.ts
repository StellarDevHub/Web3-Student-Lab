/**
 * Performance Metrics — Learning Analytics utilities.
 *
 * This module holds the *pure* (side-effect free) logic behind the Performance
 * Metrics Dashboard. Keeping the maths and data-shaping here — separate from the
 * React components — means we can unit-test the behaviour exhaustively without
 * rendering anything, and the components stay thin and declarative.
 *
 * Educational note: "completion rate", "time spent" and "achievement badges" are
 * all *derived* from a single small `LearningMetrics` snapshot. We never store
 * derived values; we compute them on demand. This keeps a single source of truth
 * and avoids the classic bug where a cached percentage drifts out of sync with
 * the raw counts it was calculated from.
 */

import { format, subDays } from 'date-fns';

/** Raw learning snapshot for a single student. Everything else is derived from this. */
export interface LearningMetrics {
  /** Lessons/courses the student has fully completed. */
  coursesCompleted: number;
  /** Total lessons/courses the student is enrolled in. */
  coursesEnrolled: number;
  /** Cumulative learning time, in minutes. */
  totalTimeSpentMinutes: number;
  /** Consecutive days with at least one study session. */
  currentStreakDays: number;
  /** Average assessment score across completed work (0–100). */
  averageScore: number;
}

/** A single day's study time, used for the time-spent bar chart. */
export interface TimeSpentPoint {
  /** Human-readable day label, e.g. "Jun 02". */
  date: string;
  /** Minutes studied on that day. */
  minutes: number;
}

/** One slice of the completion breakdown pie chart. */
export interface CompletionSlice {
  name: string;
  value: number;
  /** Hex colour used by Recharts <Cell>. */
  color: string;
}

/** A single KPI card value shown at the top of the dashboard. */
export interface MetricCard {
  label: string;
  value: string;
  /** Optional accessible description for screen readers. */
  hint: string;
}

/** Definition of an achievement and the rule that unlocks it. */
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  /** Emoji/icon glyph rendered in the badge. */
  icon: string;
  /** Predicate deciding whether the metrics earn this badge. */
  earnedWhen: (metrics: LearningMetrics) => boolean;
}

/** An achievement resolved against a concrete metrics snapshot. */
export interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
}

/**
 * Clamp a number into the inclusive [min, max] range.
 * Defensive helper so a malformed API payload can never produce, say, a 140%
 * completion rate or a negative streak.
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Completion rate as a whole-number percentage (0–100).
 * Returns 0 when the student is enrolled in nothing, avoiding a divide-by-zero.
 */
export function computeCompletionRate(metrics: LearningMetrics): number {
  if (!metrics.coursesEnrolled || metrics.coursesEnrolled <= 0) return 0;
  const rate = (metrics.coursesCompleted / metrics.coursesEnrolled) * 100;
  return Math.round(clamp(rate, 0, 100));
}

/**
 * Format a minute count as a friendly duration string.
 *  - 0            -> "0m"
 *  - 45           -> "45m"
 *  - 150          -> "2h 30m"
 *  - 120          -> "2h"
 * Negative input is treated as 0.
 */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

/** Build the two-slice completion breakdown (completed vs. remaining). */
export function buildCompletionBreakdown(metrics: LearningMetrics): CompletionSlice[] {
  const completed = clamp(metrics.coursesCompleted, 0, metrics.coursesEnrolled || metrics.coursesCompleted);
  const remaining = Math.max(0, (metrics.coursesEnrolled || 0) - completed);
  return [
    { name: 'Completed', value: completed, color: '#10b981' },
    { name: 'Remaining', value: remaining, color: '#6b7280' },
  ];
}

/** Derive the KPI cards shown at the top of the dashboard. */
export function buildMetricCards(metrics: LearningMetrics): MetricCard[] {
  return [
    {
      label: 'Completion Rate',
      value: `${computeCompletionRate(metrics)}%`,
      hint: `${metrics.coursesCompleted} of ${metrics.coursesEnrolled} courses completed`,
    },
    {
      label: 'Time Spent',
      value: formatDuration(metrics.totalTimeSpentMinutes),
      hint: 'Total time invested in learning',
    },
    {
      label: 'Current Streak',
      value: `${Math.max(0, metrics.currentStreakDays)} ${
        metrics.currentStreakDays === 1 ? 'day' : 'days'
      }`,
      hint: 'Consecutive days studied',
    },
    {
      label: 'Avg Score',
      value: `${Math.round(clamp(metrics.averageScore, 0, 100))}`,
      hint: 'Average assessment score out of 100',
    },
  ];
}

/**
 * The achievement catalogue. Each badge declares the rule that unlocks it, so
 * adding a new achievement is a one-line, data-driven change — no UI edits.
 */
export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Complete your first course',
    icon: '🌱',
    earnedWhen: (m) => m.coursesCompleted >= 1,
  },
  {
    id: 'halfway-there',
    name: 'Halfway There',
    description: 'Reach 50% overall completion',
    icon: '⚡',
    earnedWhen: (m) => computeCompletionRate(m) >= 50,
  },
  {
    id: 'finisher',
    name: 'Finisher',
    description: 'Complete every enrolled course',
    icon: '🏆',
    earnedWhen: (m) => m.coursesEnrolled > 0 && computeCompletionRate(m) >= 100,
  },
  {
    id: 'time-scholar',
    name: 'Time Scholar',
    description: 'Invest 10+ hours of study time',
    icon: '⏳',
    earnedWhen: (m) => m.totalTimeSpentMinutes >= 600,
  },
  {
    id: 'consistent',
    name: 'Consistent',
    description: 'Maintain a 7-day study streak',
    icon: '🔥',
    earnedWhen: (m) => m.currentStreakDays >= 7,
  },
  {
    id: 'high-achiever',
    name: 'High Achiever',
    description: 'Average a score of 90 or above',
    icon: '🎯',
    earnedWhen: (m) => m.averageScore >= 90,
  },
];

/** Resolve every achievement definition against a metrics snapshot. */
export function evaluateAchievements(
  metrics: LearningMetrics,
  definitions: AchievementDefinition[] = ACHIEVEMENT_DEFINITIONS
): AchievementBadge[] {
  return definitions.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    earned: def.earnedWhen(metrics),
  }));
}

/** Count how many badges have been earned. */
export function countEarnedBadges(badges: AchievementBadge[]): number {
  return badges.filter((b) => b.earned).length;
}

/**
 * Validate/normalise an untrusted metrics payload (e.g. from the API) into a
 * safe `LearningMetrics`. Missing or malformed fields fall back to 0, so the
 * dashboard degrades gracefully instead of throwing.
 */
export function normalizeMetrics(raw: unknown): LearningMetrics {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    coursesCompleted: num(r.coursesCompleted),
    coursesEnrolled: num(r.coursesEnrolled),
    totalTimeSpentMinutes: num(r.totalTimeSpentMinutes),
    currentStreakDays: num(r.currentStreakDays),
    averageScore: clamp(num(r.averageScore), 0, 100),
  };
}

/**
 * Deterministic-ish mock metrics for local development and the fallback path.
 * Note: kept free of Math.random so snapshots are stable in tests.
 */
export function generateMockMetrics(): LearningMetrics {
  return {
    coursesCompleted: 9,
    coursesEnrolled: 12,
    totalTimeSpentMinutes: 742,
    currentStreakDays: 8,
    averageScore: 87,
  };
}

/**
 * Build a deterministic week of study-time data ending today.
 * `seed` shapes the curve so different students look different without RNG.
 */
export function generateMockTimeSpent(days = 7, seed = 30): TimeSpentPoint[] {
  const data: TimeSpentPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i);
    // A simple deterministic wave: weekends dip, mid-week peaks.
    const dayOfWeek = (days - 1 - i) % 7;
    const minutes = Math.max(0, seed + dayOfWeek * 12 - (dayOfWeek > 4 ? 40 : 0));
    data.push({ date: format(date, 'MMM dd'), minutes });
  }
  return data;
}
