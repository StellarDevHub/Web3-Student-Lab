'use client';

import { AchievementBadge, countEarnedBadges } from '@/lib/analytics/performanceMetrics';

interface AchievementBadgesProps {
  badges: AchievementBadge[];
}

/**
 * AchievementBadges — a celebratory, accessible grid of learning achievements.
 *
 * Accessibility (WCAG 2.1):
 *  - The collection is a labelled <ul>/<li> list so screen readers announce the
 *    count and let users navigate item-by-item.
 *  - Each badge's earned/locked state is conveyed in text (not colour alone),
 *    satisfying SC 1.4.1 "Use of Color".
 *  - Decorative emoji icons are hidden from assistive tech with aria-hidden, and
 *    each item carries a descriptive aria-label.
 */
export default function AchievementBadges({ badges }: AchievementBadgesProps) {
  const earnedCount = countEarnedBadges(badges);

  return (
    <section
      className="bg-bg-secondary border-border-theme rounded-2xl border p-6"
      aria-labelledby="achievement-heading"
    >
      <div className="mb-6 flex items-center justify-between">
        <h3
          id="achievement-heading"
          className="text-foreground flex items-center gap-3 text-lg font-black tracking-widest uppercase"
        >
          <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
          Achievement Badges
        </h3>
        <span className="text-text-secondary text-xs font-bold tracking-widest uppercase">
          {earnedCount}/{badges.length} earned
        </span>
      </div>

      {badges.length === 0 ? (
        <p className="text-text-secondary text-sm">No achievements available yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3" role="list">
          {badges.map((badge) => (
            <li
              key={badge.id}
              aria-label={`${badge.name}: ${badge.description}. ${
                badge.earned ? 'Earned' : 'Locked'
              }`}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                badge.earned
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-border-theme bg-background opacity-60'
              }`}
            >
              <span
                className={`text-3xl ${badge.earned ? '' : 'grayscale'}`}
                aria-hidden="true"
              >
                {badge.icon}
              </span>
              <span className="text-foreground text-sm font-bold">{badge.name}</span>
              <span className="text-text-secondary text-xs">{badge.description}</span>
              <span
                className={`mt-1 text-[10px] font-bold tracking-widest uppercase ${
                  badge.earned ? 'text-green-500' : 'text-text-secondary'
                }`}
              >
                {badge.earned ? '✓ Earned' : 'Locked'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
