'use client';

import { RouteErrorFallback } from '@/components/ui/RouteErrorFallback';

export default function CoursesError({
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
      componentName="CoursesRoute"
      message="Failed to load course content. Please try again or return to the dashboard."
    />
  );
}
