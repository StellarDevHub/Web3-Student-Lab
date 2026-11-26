/**
 * crashReporter.ts — one path for every UI crash (FE-099).
 *
 * `ErrorBoundary` and the route-level `error.tsx` files all report through
 * `reportCrash`, so a crash looks the same wherever it was caught: the same
 * session log entry, the same Sentry event with the React component hierarchy,
 * the recent-actions trail, the allowlisted state snapshot and the masked wallet.
 *
 * Nothing here may throw. Crash reporting runs while the app is already broken;
 * a failure in it would replace one error with another.
 */

import * as Sentry from '@sentry/nextjs';
import { logTelemetryError, recordRecoveryAction } from '@/lib/telemetry';
import { getBreadcrumbs, type Breadcrumb } from './breadcrumbs';
import { buildStateSnapshot, getMaskedWallet, type StateSnapshot } from './context';
import { redactString } from './redact';

export interface CrashReport {
  /** Local id, shown to the student as a reference. Also a tag on the Sentry event. */
  id: string;
  /** Sentry's event id, when the event was handed to Sentry. */
  sentryEventId: string | null;
  componentName?: string;
  /** React's component hierarchy at the point of the crash, redacted. */
  componentStack?: string;
  /** Masked wallet address, or null. */
  wallet: string | null;
  /** The recent-actions trail at the time of the crash. */
  breadcrumbs: Breadcrumb[];
  snapshot: StateSnapshot;
}

/** One line per action: `2026-01-01T10:00:00.000Z ui.click: Clicked button "Run"`. */
function describeBreadcrumb(crumb: Breadcrumb): string {
  return `${new Date(crumb.timestamp).toISOString()} ${crumb.category}: ${crumb.message}`;
}

/** Cap on a student's free-text comment. */
export const MAX_FEEDBACK_LENGTH = 1000;

const FEEDBACK_STORAGE_KEY = 'soroban_crash_feedback';

// One report per error object: React strict mode and re-renders can deliver the
// same error to a boundary or `error.tsx` more than once.
const reported = new WeakMap<object, CrashReport>();

/** Capture a crash: session log, Sentry event, and a report the UI can attach feedback to. */
export function reportCrash(params: {
  error: Error;
  /** `errorInfo.componentStack` from `componentDidCatch`. */
  componentStack?: string | null;
  componentName?: string;
}): CrashReport {
  const { error, componentName } = params;

  const existing = reported.get(error);
  if (existing) return existing;

  const componentStack = params.componentStack ? redactString(params.componentStack) : undefined;
  const snapshot = buildStateSnapshot();
  const breadcrumbs = getBreadcrumbs();
  const wallet = getMaskedWallet();

  let id = '';
  try {
    id = logTelemetryError({ error, componentName, componentStack, isRecovered: false }).id;
  } catch {
    id = Math.random().toString(36).slice(2);
  }

  let sentryEventId: string | null = null;
  try {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('error_boundary', componentName ?? 'unnamed');
      scope.setTag('crash_id', id);
      // Sentry has no first-class slot for React's component hierarchy, so it
      // travels as a context alongside the event's own stack trace.
      scope.setContext('react', { componentStack: componentStack ?? null });
      scope.setContext('state_snapshot', snapshot as unknown as Record<string, unknown>);
      // Plain strings, not objects: Sentry normalises event contexts to a shallow
      // depth, and a nested object here arrives as "[Object]" with its fields lost.
      scope.setContext('recent_actions', {
        count: breadcrumbs.length,
        actions: breadcrumbs.map(describeBreadcrumb),
      });
      if (wallet) scope.setUser({ id: wallet });
      sentryEventId = Sentry.captureException(error) ?? null;
    });
  } catch {
    // Reporting must never throw into a crashed UI.
  }

  const report: CrashReport = {
    id,
    sentryEventId,
    componentName,
    componentStack,
    wallet,
    breadcrumbs,
    snapshot,
  };
  reported.set(error, report);
  return report;
}

export interface FeedbackResult {
  /** True when the comment was handed to Sentry. False means it was only saved on this device. */
  delivered: boolean;
  /** False when the comment was empty and nothing was recorded. */
  recorded: boolean;
}

function saveFeedbackLocally(reportId: string, message: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const all = JSON.parse(sessionStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]') as unknown[];
    all.push({ reportId, message, at: Date.now() });
    sessionStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(all.slice(-20)));
  } catch {
    // sessionStorage can be unavailable; the Sentry path still runs.
  }
}

/**
 * Attach a student's brief comment to a crash. The comment is scrubbed of
 * addresses, secrets and emails before it is stored or sent. It is always kept
 * for the session; whether it reached Sentry is reported back so the UI does not
 * claim a delivery that did not happen (for example when no DSN is configured).
 */
export function submitCrashFeedback(report: CrashReport, comment: string): FeedbackResult {
  const message = redactString(comment).trim().slice(0, MAX_FEEDBACK_LENGTH);
  if (!message) return { delivered: false, recorded: false };

  saveFeedbackLocally(report.id, message);
  recordRecoveryAction(report.id, 'report');

  try {
    if (!Sentry.getClient()?.getOptions().dsn) return { delivered: false, recorded: true };
    Sentry.captureFeedback({
      message,
      associatedEventId: report.sentryEventId ?? undefined,
      url: report.snapshot.route,
      tags: { crash_id: report.id, error_boundary: report.componentName ?? 'unnamed' },
    });
    return { delivered: true, recorded: true };
  } catch {
    return { delivered: false, recorded: true };
  }
}
