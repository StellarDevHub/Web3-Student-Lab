'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Copy, RefreshCw, Send, X } from 'lucide-react';
import { recordRecoveryAction } from '@/lib/telemetry';
import type { FeedbackResult } from '@/lib/telemetry/crashReporter';

interface ErrorFallbackProps {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  onReturnHome?: boolean;
  variant?: 'inline' | 'card' | 'toast' | 'recovery';
  className?: string;
  telemetryEventId?: string;
  /** Label for the retry button. The `recovery` variant defaults to "Reset & Try Again". */
  retryLabel?: string;
  /** `recovery` variant: the crash this fallback is showing, so its reference can be displayed. */
  report?: { id: string; componentName?: string };
  /** `recovery` variant: React's component hierarchy for the crash. Shown in development only. */
  componentStack?: string;
  /**
   * `recovery` variant: when given, the student can write a short crash report.
   * The result says whether it reached the monitoring service, so the UI never
   * claims a delivery that did not happen.
   */
  onSubmitReport?: (comment: string) => FeedbackResult | Promise<FeedbackResult>;
  /** `recovery` variant: extra actions rendered beside the retry button. */
  actions?: React.ReactNode;
}

const REPORT_MAX_LENGTH = 500;

interface RecoveryPanelProps {
  error?: Error | null;
  message: string;
  className?: string;
  retryLabel: string;
  report?: { id: string; componentName?: string };
  componentStack?: string;
  onRetry?: () => void;
  onSubmitReport?: (comment: string) => FeedbackResult | Promise<FeedbackResult>;
  actions?: React.ReactNode;
  onCopyStack: () => void;
}

/**
 * The crash-recovery surface (FE-099). It replaces only the component that
 * failed, so it is an inline, non-modal alert dialog rather than a blocking
 * overlay: the rest of the page (navigation, wallet controls) stays usable
 * while the student retries or writes up what happened.
 */
function RecoveryPanel({
  error,
  message,
  className,
  retryLabel,
  report,
  componentStack,
  onRetry,
  onSubmitReport,
  actions,
  onCopyStack,
}: RecoveryPanelProps) {
  const titleId = useId();
  const descId = useId();
  const formId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);

  // Announce the failure to assistive tech and put keyboard focus where the
  // broken content was, instead of leaving it on a control that no longer exists.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const isDev = process.env.NODE_ENV === 'development';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!onSubmitReport || !comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      setResult(await onSubmitReport(comment));
      setFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={panelRef}
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      className={cn(
        'flex w-full items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-6 outline-none sm:p-8',
        className
      )}
    >
      <div className="mx-auto w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
          <AlertCircle className="h-6 w-6 text-red-400" aria-hidden="true" />
        </div>
        <h2 id={titleId} className="mb-1 text-lg font-semibold text-[var(--text-strong)]">
          This section ran into a problem
        </h2>
        <p id={descId} className="text-sm leading-6 text-[var(--muted)]">
          {message} The rest of the page is still working.
        </p>
        {report && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Reference: <code className="font-mono">{report.id.slice(0, 8)}</code>
          </p>
        )}

        {isDev && error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-left">
            <p className="mb-1 text-xs font-semibold tracking-wider text-red-400 uppercase">
              Error details
            </p>
            <p className="font-mono text-xs break-all text-[var(--muted)]">{error.message}</p>
            {componentStack && (
              <pre className="mt-2 max-h-40 overflow-auto text-[10px] leading-4 whitespace-pre-wrap text-[var(--muted)]">
                {componentStack.trim()}
              </pre>
            )}
            {error.stack && (
              <button
                type="button"
                onClick={onCopyStack}
                className="mt-2 text-xs font-medium text-blue-400 underline underline-offset-2 hover:text-blue-300"
                aria-label="Copy error stack"
              >
                Copy stack
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-strong)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {retryLabel}
            </button>
          )}
          {onSubmitReport && !result && (
            <button
              type="button"
              onClick={() => setFormOpen((open) => !open)}
              aria-expanded={formOpen}
              aria-controls={formId}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-white/10"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send crash report
            </button>
          )}
          {actions}
        </div>

        {onSubmitReport && formOpen && !result && (
          <form id={formId} onSubmit={submit} className="mt-4 text-left">
            <label
              htmlFor={`${formId}-comment`}
              className="mb-1 block text-xs font-medium text-[var(--text-strong)]"
            >
              What were you doing when this broke?
            </label>
            <textarea
              id={`${formId}-comment`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={REPORT_MAX_LENGTH}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-sm text-[var(--text-strong)]"
              aria-describedby={`${formId}-hint`}
            />
            <p id={`${formId}-hint`} className="mt-1 text-[11px] text-[var(--muted)]">
              A few words is plenty. Please don&apos;t include passwords, secret keys or recovery
              phrases. Addresses and emails are removed before this is sent. The report also
              includes your recent clicks and page navigation, and the page you were on.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--text-strong)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!comment.trim() || submitting}
                className="rounded-lg bg-[var(--brand-strong)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Submit report'}
              </button>
            </div>
          </form>
        )}

        {result && (
          <p role="status" className="mt-4 text-xs text-[var(--muted)]">
            {result.delivered
              ? 'Thanks, your report was sent.'
              : 'Thanks, your report was saved on this device. Crash reporting is not connected here, so it has not been sent yet.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function ErrorFallback({
  error,
  message = 'An error occurred',
  onRetry,
  onDismiss,
  onReturnHome,
  variant = 'card',
  className,
  telemetryEventId,
  retryLabel,
  report,
  componentStack,
  onSubmitReport,
  actions,
}: ErrorFallbackProps) {
  const handleCopyStack = () => {
    if (!error?.stack) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(error.stack);
    }
  };

  const handleDismiss = () => {
    if (telemetryEventId) recordRecoveryAction(telemetryEventId, 'dismiss');
    onDismiss?.();
  };

  const handleRetry = () => {
    if (telemetryEventId) recordRecoveryAction(telemetryEventId, 'reset');
    onRetry?.();
  };

  const handleHome = () => {
    if (telemetryEventId) recordRecoveryAction(telemetryEventId, 'home');
    if (onReturnHome) {
      if (typeof window !== 'undefined') window.location.href = '/dashboard';
    }
  };

  if (variant === 'recovery') {
    return (
      <RecoveryPanel
        error={error}
        message={message}
        className={className}
        retryLabel={retryLabel ?? 'Reset & Try Again'}
        report={report}
        componentStack={componentStack}
        onRetry={onRetry ? handleRetry : undefined}
        onSubmitReport={onSubmitReport}
        actions={actions}
        onCopyStack={handleCopyStack}
      />
    );
  }

  if (variant === 'inline') {
    return (
      <div
        role="alert"
        className={cn(
          'flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4',
          className
        )}
      >
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-400">{message}</p>
          {error && process.env.NODE_ENV === 'development' && (
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-xs text-[var(--muted)] break-all">
                {error.message}
              </p>
              <button
                onClick={handleCopyStack}
                className="text-xs font-medium text-blue-400 underline underline-offset-2 hover:text-blue-300"
                aria-label="Copy error stack"
              >
                <Copy className="h-3 w-3 mr-1" /> Copy stack
              </button>
            </div>
          )}
          {onRetry && (
            <button
              onClick={handleRetry}
              className="mt-2 text-xs font-medium text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              Retry
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="shrink-0 text-[var(--muted)] hover:text-[var(--text-strong)]"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'toast') {
    return (
      <div
        role="alert"
        className={cn(
          'pointer-events-auto flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 backdrop-blur-md',
          className
        )}
      >
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-strong)]">{message}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {error?.message || 'Please try again later'}
          </p>
          {error && process.env.NODE_ENV === 'development' && error.stack && (
            <button
              onClick={handleCopyStack}
              className="mt-2 text-xs font-medium text-blue-400 underline underline-offset-2 hover:text-blue-300"
              aria-label="Copy error stack"
            >
              <Copy className="h-3 w-3 mr-1" /> Copy stack
            </button>
          )}
          {onRetry && (
            <button
              onClick={handleRetry}
              className="mt-2 text-xs font-medium text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              Retry
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="shrink-0 text-[var(--muted)] hover:text-[var(--text-strong)]"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex min-h-[300px] w-full items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/3 p-8',
        className
      )}
    >
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
          <AlertCircle className="h-6 w-6 text-red-400" />
        </div>
        <h3 className="mb-1 text-lg font-semibold text-[var(--text-strong)]">Error</h3>
        <p className="text-sm text-[var(--muted)]">{message}</p>
        {error && process.env.NODE_ENV === 'development' && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-left">
            <p className="mb-1 text-xs font-semibold tracking-wider text-red-400 uppercase">
              Error details
            </p>
            <div className="flex items-start gap-2">
              <p className="font-mono text-xs text-[var(--muted)] break-all">
                {error.message}
              </p>
              {error.stack && (
                <button
                  onClick={handleCopyStack}
                  className="text-xs font-medium text-blue-400 underline underline-offset-2 hover:text-blue-300 ml-2"
                  aria-label="Copy error stack"
                >
                  Copy stack
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {onRetry && (
            <button
              onClick={handleRetry}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-strong)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          )}
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-white/10"
            >
              Dismiss
            </button>
          )}
          {onReturnHome && (
            <a
              onClick={handleHome}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Return to Dashboard
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
