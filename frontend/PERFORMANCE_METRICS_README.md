# Performance Metrics Dashboard (Learning Analytics)

A student-facing dashboard that surfaces **learning progress, time spent,
completion rates, and achievement badges**. It reuses the existing analytics
infrastructure (same API endpoints and visual language as the Analytics Hub) and
is built with **React 19 + TypeScript** and **Recharts**.

Route: `/performance-metrics`

## Architecture

The feature follows a strict **data → derive → render** separation, which keeps
each layer small and independently testable:

| Layer | File | Responsibility |
|-------|------|----------------|
| Pure logic | [`src/lib/analytics/performanceMetrics.ts`](src/lib/analytics/performanceMetrics.ts) | Types, metric maths, badge rules, mock data — no React, no I/O |
| Data | [`src/hooks/usePerformanceMetrics.ts`](src/hooks/usePerformanceMetrics.ts) | Fetches `/analytics/user/:id` (falls back to `/analytics/overview`), normalises payload, graceful mock fallback on error |
| View | [`src/components/performance-metrics/PerformanceMetricsDashboard.tsx`](src/components/performance-metrics/PerformanceMetricsDashboard.tsx) | Prop-driven KPI cards + charts |
| View | [`src/components/performance-metrics/AchievementBadges.tsx`](src/components/performance-metrics/AchievementBadges.tsx) | Accessible earned/locked badge grid |
| Route | [`src/app/performance-metrics/page.tsx`](src/app/performance-metrics/page.tsx) | Wires the hook to the dashboard |

Because all derivation is pure, the components take plain props and need no
mocking of network state in tests.

## What it shows

- **KPI cards** — completion rate %, total time spent, current study streak, average score.
- **Time Spent** — bar chart of daily study minutes.
- **Completion Rate** — pie chart of completed vs. remaining courses.
- **Achievement Badges** — six data-driven achievements (e.g. *First Steps*,
  *Finisher*, *Time Scholar*) that unlock based on the metrics snapshot.

## Adding an achievement

Achievements are data-driven — add an entry to `ACHIEVEMENT_DEFINITIONS` in the
lib; no UI changes are required:

```ts
{
  id: 'night-owl',
  name: 'Night Owl',
  description: 'Study 5 days in a row',
  icon: '🦉',
  earnedWhen: (m) => m.currentStreakDays >= 5,
}
```

## Error handling & fallbacks

If the analytics request fails (common when the backend is offline in local
dev), the hook keeps deterministic mock data and sets `isFallback`/`error`. The
dashboard then shows an `role="alert"` banner explaining sample data is in use,
so the view never goes blank.

## Accessibility (WCAG 2.1)

- KPI values and charts carry descriptive `aria-label`s; charts use `role="img"`.
- Loading uses `role="status"` + `aria-busy`; fallback uses `role="alert"`.
- Badge earned/locked state is conveyed in **text**, not colour alone (SC 1.4.1).
- Decorative icons are `aria-hidden`; badges are a semantic labelled list.

## Tests

Minimal unit tests cover the core pure logic (completion rate, duration
formatting, achievement evaluation):

```bash
cd frontend
npx vitest run src/lib/analytics/__tests__/performanceMetrics.test.ts
```
