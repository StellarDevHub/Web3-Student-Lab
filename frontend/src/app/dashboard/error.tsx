'use client';

import { RouteErrorFallback } from '@/components/ui/RouteErrorFallback';

export default function DashboardError({
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
      componentName="DashboardRoute"
      message="Failed to load your dashboard. Please try again."
    />
  );
}
