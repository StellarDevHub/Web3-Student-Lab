'use client';

import { DataSourceState } from '@/lib/analytics/performanceMetrics';

export interface DataSourceNoticeProps {
  dataSource: DataSourceState;
  /** ISO timestamp of the last verified live fetch; shown for cached data. */
  lastVerifiedAt?: string | null;
  /** Called when the user asks to retry the live fetch. */
  onRetry?: () => void;
}

const FALLBACK_MESSAGE = 'Showing sample data — live analytics are unavailable.';
const CACHED_MESSAGE =
  'Showing the last verified snapshot — the live refresh failed.';

/**
 * DataSourceNotice — a non-blocking, screen-reader-friendly indicator that
 * tells learners exactly what the numbers on screen are:
 *
 *  - live: nothing warning-like is shown; the data is verified.
 *  - cached: notes the live refresh failed and that the last verified snapshot
 *    is being shown, with a retry action.
 *  - fallback: states plainly that the dashboard is showing sample data, with a
 *    retry action.
 *
 * This is the transparency surface required by the issue: users can always tell
 * whether displayed metrics are live, cached, or fallback.
 */
export default function DataSourceNotice({
  dataSource,
  lastVerifiedAt,
  onRetry,
}: DataSourceNoticeProps) {
  if (dataSource === 'live') {
    return (
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-xs font-bold tracking-widest text-green-500 uppercase"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true"></span>
        Live data
      </p>
    );
  }

  const message = dataSource === 'cached' ? CACHED_MESSAGE : FALLBACK_MESSAGE;
  const detail =
    dataSource === 'cached' && lastVerifiedAt
      ? ` Verified ${new Date(lastVerifiedAt).toLocaleString()}.`
      : '';

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-border-theme bg-bg-secondary flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm"
    >
      <span
        className="h-2 w-2 rounded-full bg-yellow-500"
        aria-hidden="true"
      ></span>
      <span className="text-text-secondary flex-1">
        {message}
        {detail}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="hover:bg-red-500/10 rounded-lg border border-red-500/40 px-3 py-1 text-xs font-bold tracking-widest text-red-500 uppercase"
        >
          Retry
        </button>
      )}
    </div>
  );
}
