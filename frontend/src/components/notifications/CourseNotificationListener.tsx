'use client';

import { useCourseNotifications } from '@/hooks/useCourseNotifications';

/**
 * Mounted once in the root layout to activate the `useCourseNotifications`
 * hook so course-related WebSocket events are bridged into the
 * NotificationContext for the entire app.
 *
 * Also renders a small, non-intrusive status pill while the live
 * notification socket is disconnected or reconnecting, so users understand
 * why realtime updates are temporarily delayed (#898).
 */
export function CourseNotificationListener() {
  const { connectionState, reconnectAttempt, retryExhausted, lastError } =
    useCourseNotifications();

  const isReconnecting = connectionState === 'reconnecting';
  const isDisconnected = connectionState === 'disconnected';

  if (!isReconnecting && !isDisconnected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/90 px-3 py-1.5 text-xs text-gray-300 shadow-lg backdrop-blur"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isReconnecting ? 'animate-pulse bg-amber-400' : 'bg-red-400'
        }`}
        aria-hidden="true"
      />
      <span>
        {isReconnecting
          ? `Reconnecting… (attempt ${Math.max(reconnectAttempt, 1)})`
          : retryExhausted
            ? 'Live notifications unavailable'
            : 'Live notifications disconnected'}
      </span>
      {lastError ? <span className="sr-only">{lastError}</span> : null}
    </div>
  );
}
