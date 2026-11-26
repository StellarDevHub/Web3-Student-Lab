'use client';

import React from 'react';
import { Home, ArrowLeft, Save, RotateCcw } from 'lucide-react';
import { ErrorFallback } from '@/components/ui/ErrorFallback';
import { useGlobalStore } from '@/stores/globalStore';
import { recordRecoveryAction } from '@/lib/telemetry';
import { installBreadcrumbTracking, recordBreadcrumb } from '@/lib/telemetry/breadcrumbs';
import { reportCrash, submitCrashFeedback, type CrashReport } from '@/lib/telemetry/crashReporter';

/** Extra handles passed to a custom `fallback` function. */
export interface ErrorBoundaryFallbackHelpers {
  telemetryEventId: string | null;
  /** The crash report, once captured. Use it with `submitCrashFeedback`. */
  report: CrashReport | null;
  rescueSession: () => void;
  exportSession: () => void;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?:
    | React.ReactNode
    | ((error: Error, reset: () => void, helpers: ErrorBoundaryFallbackHelpers) => React.ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: unknown[];
  /** Names this boundary in crash reports (a Sentry tag). Give each boundary a distinct one. */
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  telemetryEventId: string | null;
  report: CrashReport | null;
}

/**
 * Isolates a render crash to the subtree it wraps (FE-099).
 *
 * Everything outside the boundary keeps rendering and stays interactive; only
 * this subtree is replaced by the recovery fallback. A crash is reported once,
 * through `reportCrash`: it is logged to the session, sent to Sentry with React's
 * component stack, the recent-actions breadcrumbs, an allowlisted state snapshot
 * and the masked wallet address, and handed to the fallback so the student can
 * add a brief report of their own.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      telemetryEventId: null,
      report: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidMount() {
    // Idempotent. Starts the recent-actions trail even if the app bootstrap did not.
    installBreadcrumbTracking();
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);

    // `componentStack` lives on `errorInfo`, not on the error, so it is passed in explicitly.
    const report = reportCrash({
      error,
      componentStack: errorInfo.componentStack,
      componentName: this.props.componentName,
    });

    this.setState((prevState) => ({
      errorInfo,
      report,
      telemetryEventId: prevState.telemetryEventId || report.id,
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

  private clearError() {
    this.setState({ hasError: false, error: null, errorInfo: null, report: null });
  }

  reset = () => {
    if (this.state.telemetryEventId) {
      recordRecoveryAction(this.state.telemetryEventId, 'reset');
    }
    recordBreadcrumb({
      category: 'app',
      message: `Reset ${this.props.componentName ?? 'component'} after a crash`,
    });
    this.clearError();
  };

  rescueSession = () => {
    if (this.state.telemetryEventId) {
      recordRecoveryAction(this.state.telemetryEventId, 'reset');
    }
    useGlobalStore.getState().resetAllStores();
    this.clearError();
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
            report: this.state.report,
            rescueSession: this.rescueSession,
            exportSession: this.exportSession,
          });
        }
        return this.props.fallback;
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          componentStack={this.state.errorInfo?.componentStack ?? undefined}
          report={this.state.report}
          reset={this.reset}
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
  componentStack?: string;
  report: CrashReport | null;
  reset: () => void;
  rescueSession: () => void;
  exportSession: () => void;
}

const secondaryAction =
  'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors';

function DefaultErrorFallback({
  error,
  componentStack,
  report,
  reset,
  rescueSession,
  exportSession,
}: DefaultErrorFallbackProps) {
  return (
    <div className="flex min-h-[320px] w-full items-center justify-center p-4 sm:p-8">
      <ErrorFallback
        variant="recovery"
        error={error}
        componentStack={componentStack}
        report={report ?? undefined}
        message="Something unexpected happened here, so we stopped this section from rendering."
        onRetry={reset}
        onSubmitReport={report ? (comment) => submitCrashFeedback(report, comment) : undefined}
        actions={
          <>
            <button
              type="button"
              onClick={rescueSession}
              className={`${secondaryAction} border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Rescue session
            </button>
            <button
              type="button"
              onClick={exportSession}
              className={`${secondaryAction} border-blue-500/20 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10`}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Export state
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className={`${secondaryAction} border-white/10 bg-white/5 text-[var(--text-strong)] hover:bg-white/10`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go back
            </button>
            <a
              href="/"
              className={`${secondaryAction} border-white/10 bg-white/5 text-[var(--text-strong)] hover:bg-white/10`}
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Home
            </a>
          </>
        }
      />
    </div>
  );
}
