'use client';

import React from 'react';

interface ExperimentalBannerProps {
  featureName?: string;
  description?: string;
}

/**
 * ExperimentalBanner
 *
 * Displayed on routes that are work-in-progress or experimental.
 * Wraps the child content so the rest of the page still renders.
 */
export function ExperimentalBanner({ featureName, description }: ExperimentalBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
    >
      {/* Icon */}
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>

      <div>
        <p className="font-semibold text-amber-300">
          🧪 Experimental{featureName ? `: ${featureName}` : ''}
        </p>
        <p className="mt-0.5 text-amber-200/80">
          {description ??
            'This feature is under active development. Some functionality may be incomplete or subject to change.'}
        </p>
      </div>
    </div>
  );
}
