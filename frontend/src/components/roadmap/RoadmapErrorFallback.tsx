'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface RoadmapErrorFallbackProps {
  message: string;
  onRetry?: () => void;
}

export function RoadmapErrorFallback({
  message,
  onRetry,
}: RoadmapErrorFallbackProps) {
  return (
    <div
      className="flex min-h-[400px] flex-col items-center justify-center gap-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-8"
      role="alert"
      aria-live="assertive"
    >
      <AlertTriangle className="text-red-500" size={48} aria-hidden="true" />
      <div className="text-center">
        <h3 className="mb-2 text-lg font-bold text-white">
          Failed to Load Roadmap
        </h3>
        <p className="max-w-md text-sm leading-relaxed text-gray-400">
          {message}
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-xs font-bold tracking-widest text-white uppercase transition-all hover:bg-red-500 active:scale-[0.98]"
          aria-label="Retry loading roadmap"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}
