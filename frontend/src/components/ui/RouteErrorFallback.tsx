'use client';

import React, { useEffect } from 'react';
import { ErrorFallback } from '@/components/ui/ErrorFallback';
import { submitCrashFeedback } from '@/lib/telemetry/crashReporter';
import { useReportRouteError } from '@/lib/telemetry/useReportRouteError';
import { useGlobalStore } from '@/stores/globalStore';

interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Names the route in crash reports (a Sentry tag), e.g. `CoursesRoute`. */
  componentName: string;
  message: string;
}

/**
 * Shared body for Next.js `error.tsx` files (FE-099). It reports the crash through
 * the same path as `ErrorBoundary` — Sentry event with breadcrumbs, state snapshot
 * and masked wallet — and shows the same recovery UI, so a route-level crash gets
 * "Reset & Try Again" and a crash-report form like a component-level one does.
 *
 * Next.js only mounts an `error.tsx` for its own segment, so the layout shell
 * above it (navigation, wallet controls) stays interactive.
 */
export function RouteErrorFallback({
  error,
  reset,
  componentName,
  message,
}: RouteErrorFallbackProps) {
  const report = useReportRouteError(error, componentName);
  const setGlobalError = useGlobalStore((state) => state.setGlobalError);

  useEffect(() => {
    setGlobalError({
      message: error.message,
      code: error.digest,
      timestamp: Date.now(),
    });
  }, [error, setGlobalError]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6">
      <ErrorFallback
        variant="recovery"
        error={error}
        message={message}
        report={report ?? undefined}
        onRetry={reset}
        onSubmitReport={report ? (comment) => submitCrashFeedback(report, comment) : undefined}
        actions={
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-white/10"
          >
            Return to Dashboard
          </a>
        }
      />
    </div>
  );
}
