'use client';

import { AlertTriangle } from 'lucide-react';

interface DemoDataBannerProps {
  message?: string;
}

/**
 * Shown whenever the backend reports `dataSource: 'demo'` (#911) — i.e.
 * live database data was unavailable and the response contains the
 * hardcoded demo/fallback dataset instead. Keeps learners from mistaking
 * stale demo content for real course data.
 */
export function DemoDataBanner({ message }: DemoDataBannerProps) {
  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-300"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <p className="text-sm font-mono">
        {message || 'Showing demo data — live data is temporarily unavailable.'}
      </p>
    </div>
  );
}
