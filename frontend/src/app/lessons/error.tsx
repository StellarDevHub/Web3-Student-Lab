'use client';

import { RouteErrorFallback } from '@/components/ui/RouteErrorFallback';

export default function LessonsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorFallback
      error={error}
      reset={reset}
      componentName="LessonsRoute"
      message="Failed to load this lesson. Please try again or return to the dashboard."
    />
  );
}
