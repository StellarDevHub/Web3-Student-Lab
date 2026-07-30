'use client';

import { useEffect } from 'react';
import { useGlobalStore } from '@/stores/globalStore';
import { ErrorFallback } from '@/components/ui/ErrorFallback';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const setGlobalError = useGlobalStore((state) => state.setGlobalError);

  useEffect(() => {
    // Report unexpected errors through the existing client-safe monitoring path
    setGlobalError({
      message: error.message,
      timestamp: Date.now(),
    });
    // We log the error to the console for development visibility
    console.error('Core application error:', error);
  }, [error, setGlobalError]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6">
      <ErrorFallback
        error={error}
        message="An unexpected error occurred in the application."
        onRetry={reset}
        onReturnHome={true}
      />
    </div>
  );
}
