'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, X } from 'lucide-react';

interface ErrorFallbackProps {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'card' | 'toast';
  className?: string;
}

export function ErrorFallback({
  error,
  message = 'An error occurred',
  onRetry,
  onDismiss,
  variant = 'card',
  className,
}: ErrorFallbackProps) {
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
            <p className="mt-1 font-mono text-xs text-[var(--muted)] break-all">
              {error.message}
            </p>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs font-medium text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              Retry
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
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
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs font-medium text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              Retry
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
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
          <p className="mt-2 font-mono text-xs text-[var(--muted)] break-all">{error.message}</p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--brand-strong)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
