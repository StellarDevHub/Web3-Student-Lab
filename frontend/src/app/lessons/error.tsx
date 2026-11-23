'use client';

import { useEffect } from 'react';
import { useGlobalStore } from '@/stores/globalStore';
import { ErrorFallback } from '@/components/ui/ErrorFallback';

export default function LessonsError({
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
    console.error('Lessons route error:', error);
  }, [error, setGlobalError]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6">
      <ErrorFallback
        error={error}
        message="Failed to load this lesson. Please try again or return to the dashboard."
        onRetry={reset}
        onReturnHome={true}
      />
    </div>
  );
}
