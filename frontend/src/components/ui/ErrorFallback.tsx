'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Copy, X } from 'lucide-react';
import { logTelemetryError, recordRecoveryAction } from '@/lib/telemetry';

interface ErrorFallbackProps {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  onReturnHome?: boolean;
  variant?: 'inline' | 'card' | 'toast';
  className?: string;
  telemetryEventId?: string;
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
