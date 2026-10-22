'use client';

import { useEffect } from 'react';
import { useGlobalStore } from '@/stores/globalStore';
import { ErrorFallback } from '@/components/ui/ErrorFallback';
import { logTelemetryError } from '@/lib/telemetry';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const setGlobalError = useGlobalStore((state) => state.setGlobalError);

  useEffect(() => {
    // Automated telemetry logging for route-level errors
    const event = logTelemetryError({
      error: error as Error & { componentStack?: string },
      componentName: 'GlobalErrorBoundary',
      isRecovered: false,
    });

    // Report unexpected errors through the existing client-safe monitoring path
    setGlobalError({
      message: error.message,
      code: event.id,
      timestamp: Date.now(),
    });
    // We log the error to the console for development visibility
    console.error('Core application error:', error);
  }, [error, setGlobalError]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6">
      {/* Preserve navbar/shell: only this route segment errors; layout shells above remain mounted */}
      <ErrorFallback
        error={error}
        message="An unexpected error occurred in the application."
        onRetry={() => {
          reset();
        }}
        onReturnHome={true}
        telemetryEventId={error.digest || undefined}
      />
    </div>
  );
}
