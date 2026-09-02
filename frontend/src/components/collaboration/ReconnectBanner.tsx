'use client';

/**
 * ReconnectBanner
 *
 * A user-facing status banner that surfaces three collaboration states:
 *
 *  • disconnected / reconnecting  – tells the student their edits are being
 *    saved locally and will sync once the connection is restored.  Includes a
 *    manual "Reconnect" action.
 *
 *  • conflict detected            – lets the student know remote changes
 *    arrived while they were offline and gives them the option to review the
 *    diff (via onReviewConflict) or dismiss the notice.
 *
 * Accessibility:
 *  – Uses role="status" (polite live region) for non-disruptive announcements
 *    and role="alert" (assertive) for conflict warnings.
 *  – Buttons carry descriptive aria-labels so screen-reader users know exactly
 *    what each action does.
 *  – The banner is keyboard-focusable via normal tab order.
 *  – No internal error codes or stack traces are surfaced to the user.
 *
 * Layout:
 *  – Positioned at the top of its nearest positioned ancestor so it overlays
 *    the canvas without pushing content down.
 *  – Uses responsive flex layout that stacks on narrow viewports.
 */

import type { ReconnectStatus } from '@/hooks/useCollaborativeEditor';

export interface ReconnectBannerProps {
  /** Current connection status from useCollaborativeEditor. */
  status: ReconnectStatus;
  /** Number of local edits buffered while offline. */
  pendingUpdateCount: number;
  /** Whether a merge conflict was detected on reconnect. */
  hasConflict: boolean;
  /** Called when the user presses the "Reconnect" button. */
  onReconnect: () => void;
  /** Called when the user presses "Review changes". */
  onReviewConflict: () => void;
  /** Called when the user presses "Dismiss" on the conflict banner. */
  onDismissConflict: () => void;
}

export function ReconnectBanner({
  status,
  pendingUpdateCount,
  hasConflict,
  onReconnect,
  onReviewConflict,
  onDismissConflict,
}: ReconnectBannerProps) {
  const showReconnectBanner = status === 'disconnected' || status === 'reconnecting';

  if (!showReconnectBanner && !hasConflict) {
    return null;
  }

  // Conflict banner takes precedence — render it above the reconnect notice.
  if (hasConflict) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-col items-start gap-2 bg-amber-500/95 px-4 py-3 text-slate-900 shadow-md
                   sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-2 sm:items-center">
          {/* Warning icon */}
          <svg
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17
                 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10
                 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1
                 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm font-medium leading-snug">
            Remote changes arrived while you were offline.{' '}
            <span className="font-semibold">Review your edits</span> before continuing.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onReviewConflict}
            aria-label="Review conflicting changes"
            className="rounded bg-slate-900/15 px-3 py-1.5 text-xs font-semibold
                       transition-colors hover:bg-slate-900/25 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            Review changes
          </button>
          <button
            type="button"
            onClick={onDismissConflict}
            aria-label="Dismiss conflict notice"
            className="rounded bg-slate-900/10 px-3 py-1.5 text-xs font-semibold
                       transition-colors hover:bg-slate-900/20 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Reconnect / reconnecting banner
  const isReconnecting = status === 'reconnecting';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex flex-col items-start gap-2 bg-rose-600/90 px-4 py-3 text-white shadow-md
                 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2 sm:items-center">
        {isReconnecting ? (
          /* Animated spinner */
          <svg
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 animate-spin sm:mt-0"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          /* Disconnected icon */
          <svg
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483
                 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
        )}

        <div>
          <p className="text-sm font-semibold leading-tight">
            {isReconnecting ? 'Reconnecting…' : 'Collaboration disconnected'}
          </p>
          <p className="text-xs text-rose-100">
            {pendingUpdateCount > 0
              ? `${pendingUpdateCount} edit${pendingUpdateCount !== 1 ? 's' : ''} saved locally – will sync when reconnected`
              : 'Your edits are saved locally and will sync when the connection is restored.'}
          </p>
        </div>
      </div>

      {!isReconnecting && (
        <button
          type="button"
          onClick={onReconnect}
          aria-label="Manually attempt to reconnect to the collaboration server"
          className="shrink-0 rounded bg-white/15 px-3 py-1.5 text-xs font-semibold
                     transition-colors hover:bg-white/25 focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-white"
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
