'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home, ArrowLeft, Save, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalStore } from '@/stores/globalStore';
import { logTelemetryError, recordRecoveryAction } from '@/lib/telemetry';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: unknown[];
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  telemetryEventId: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      telemetryEventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);

    // Automated telemetry logging
    const event = logTelemetryError({
      error: error as Error & { componentStack?: string },
      componentName: this.props.componentName,
      isRecovered: false,
    });

    this.setState((prevState) => ({
      errorInfo,
      telemetryEventId: prevState.telemetryEventId || event.id,
    }));
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      );
      if (hasChanged) {
        this.reset();
      }
    }
  }

  reset = () => {
    if (this.state.telemetryEventId) {
      recordRecoveryAction(this.state.telemetryEventId, 'reset');
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  rescueSession = () => {
    if (this.state.telemetryEventId) {
      recordRecoveryAction(this.state.telemetryEventId, 'reset');
    }
    useGlobalStore.getState().resetAllStores();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  exportSession = () => {
    const stateJson = useGlobalStore.getState().exportState();
    const blob = new Blob([stateJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soroban-session-rescue-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.reset, {
            telemetryEventId: this.state.telemetryEventId,
            rescueSession: this.rescueSession,
            exportSession: this.exportSession,
          });
        }
        return this.props.fallback;
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          reset={this.reset}
          telemetryEventId={this.state.telemetryEventId}
          rescueSession={this.rescueSession}
          exportSession={this.exportSession}
        />
      );
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error;
  reset: () => void;
  telemetryEventId: string | null;
  rescueSession: () => void;
  exportSession: () => void;
}

function DefaultErrorFallback({
  error,
  reset,
  telemetryEventId,
  rescueSession,
  exportSession,
}: DefaultErrorFallbackProps) {
  return (
    <div className="flex min-h-[400px] w-full items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>

        <h2 className="mb-2 text-2xl font-semibold text-[var(--text-strong)]">
          Something went wrong
        </h2>

        <p className="mb-6 text-sm leading-7 text-[var(--muted)]">
          An unexpected error occurred. Your editor state is preserved — try resetting this section,
          rescuing the full session, or going back to safety.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-left">
            <div className="flex items-start gap-2 mb-2">
              <p className="mb-1 text-xs font-semibold tracking-wider text-red-400 uppercase">
                Error details
              </p>
              {error.stack && (
                <button
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(error.stack);
                    }
                  }}
                  className="text-xs font-medium text-blue-400 underline underline-offset-2 hover:text-blue-300 ml-2"
                  aria-label="Copy error stack"
                >
                  Copy stack
                </button>
              )}
            </div>
            <p className="font-mono text-xs text-[var(--muted)] break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-strong)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Reset section
          </button>

          <button
            onClick={rescueSession}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-2.5 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
          >
            <RotateCcw className="h-4 w-4" />
            Rescue session
          </button>

          <button
            onClick={exportSession}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-2.5 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-500/10"
          >
            <Save className="h-4 w-4" />
            Export state
          </button>

          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>

          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-white/10"
          >
            <Home className="h-4 w-4" />
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
