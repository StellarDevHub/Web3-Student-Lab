'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  DataSourceState,
  LearningMetrics,
  TimeSpentPoint,
  buildCompletionBreakdown,
  buildMetricCards,
  createMetricsExport,
  evaluateAchievements,
} from '@/lib/analytics/performanceMetrics';
import AchievementBadges from './AchievementBadges';
import DataSourceNotice from './DataSourceNotice';

export interface PerformanceMetricsDashboardProps {
  metrics: LearningMetrics;
  timeSpent: TimeSpentPoint[];
  isLoading?: boolean;
  /** Deprecated in favour of `dataSource`; kept for callers using the old flag. */
  isFallback?: boolean;
  /** What the displayed data actually is. Defaults to `live`. */
  dataSource?: DataSourceState;
  /** ISO timestamp of the last verified live fetch; shown for cached data. */
  lastVerifiedAt?: string | null;
  /** Called when the user asks to retry the live fetch. */
  onRetry?: () => void;
}

/** Shared Recharts tooltip styling, matching the existing analytics charts. */
const TOOLTIP_STYLE = {
  backgroundColor: '#09090b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
};

/**
 * PerformanceMetricsDashboard — the presentational heart of the Learning
 * Analytics performance view.
 *
 * It is intentionally a *pure prop-driven* component: all data fetching lives in
 * {@link usePerformanceMetrics}, while all derivation lives in the
 * `performanceMetrics` lib. That separation keeps this component trivial to test
 * (just pass props) and free of network concerns.
 *
 * Renders, in order: KPI cards, a "time spent" bar chart, a completion-rate pie
 * chart, and the achievement badges grid. Handles loading and error fallbacks.
 */
export default function PerformanceMetricsDashboard({
  metrics,
  timeSpent,
  isLoading = false,
  isFallback = false,
  dataSource = isFallback ? 'fallback' : 'live',
  lastVerifiedAt = null,
  onRetry,
}: PerformanceMetricsDashboardProps) {
  // --- Loading state -------------------------------------------------------
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex min-h-[300px] items-center justify-center"
      >
        <span className="text-text-secondary text-sm font-bold tracking-widest uppercase">
          Loading performance metrics…
        </span>
      </div>
    );
  }

  // Derive all view data from the raw snapshot. Cheap + pure, so it is fine to
  // recompute on every render.
  const cards = buildMetricCards(metrics);
  const completion = buildCompletionBreakdown(metrics);
  const badges = evaluateAchievements(metrics);

  // Sample/fallback data must never be exported as real learner progress, so the
  // export is disabled in that state. Cached (stale-but-real) data is exportable
  // but the payload is always labelled with its provenance.
  const exportDisabled = dataSource === 'fallback';

  function handleExport() {
    if (exportDisabled) return;
    const payload = createMetricsExport(metrics, { state: dataSource, lastVerifiedAt });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `learning-performance-${dataSource}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Data-source transparency: live vs cached vs fallback */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataSourceNotice dataSource={dataSource} lastVerifiedAt={lastVerifiedAt} onRetry={onRetry} />
        <button
          type="button"
          onClick={handleExport}
          disabled={exportDisabled}
          aria-disabled={exportDisabled}
          title={
            exportDisabled
              ? 'Sample data cannot be exported as learner progress'
              : `Export data (${dataSource})`
          }
          className="hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent rounded-lg border border-red-500/40 px-3 py-1 text-xs font-bold tracking-widest text-red-500 uppercase"
        >
          Export data
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-bg-secondary border-border-theme rounded-2xl border p-6 transition-all hover:border-red-500/50"
          >
            <p className="text-text-secondary mb-2 text-xs font-bold tracking-widest uppercase">
              {card.label}
            </p>
            <p
              className="text-foreground font-mono text-3xl font-black"
              aria-label={`${card.label}: ${card.value}. ${card.hint}`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Time spent bar chart */}
        <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
          <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
            <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
            Time Spent
          </h3>
          <div role="img" aria-label="Bar chart of daily study time in minutes over the recent period">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={timeSpent}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#a1a1aa" style={{ fontSize: '12px' }} />
                <YAxis stroke="#a1a1aa" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="minutes" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Completion rate pie chart */}
        <div className="bg-bg-secondary border-border-theme rounded-2xl border p-6">
          <h3 className="text-foreground mb-6 flex items-center gap-3 text-lg font-black tracking-widest uppercase">
            <span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true"></span>
            Completion Rate
          </h3>
          <div role="img" aria-label="Pie chart of completed versus remaining courses">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={completion}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {completion.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Achievement badges */}
      <AchievementBadges badges={badges} />
    </div>
  );
}
