'use client';

import { useEffect, useState } from 'react';
import { reportCrash, type CrashReport } from './crashReporter';

/**
 * Report a route-level error (a Next.js `error.tsx` boundary) through the same
 * crash path as `ErrorBoundary`, and hand back the report so the fallback can
 * show its reference and offer the crash-report form.
 */
export function useReportRouteError(
  error: Error & { digest?: string },
  componentName: string
): CrashReport | null {
  const [report, setReport] = useState<CrashReport | null>(null);

  useEffect(() => {
    // `reportCrash` is idempotent per error object, so strict-mode double effects
    // do not produce two Sentry events.
    setReport(reportCrash({ error, componentName }));
  }, [error, componentName]);

  return report;
}
