'use client';

import { RouteErrorFallback } from '@/components/ui/RouteErrorFallback';

export default function SimulatorError({
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
      componentName="SimulatorRoute"
      message="The simulator encountered an error. Please try again."
    />
  );
}
