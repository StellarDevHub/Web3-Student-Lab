'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { scrubSensitiveString } from '../../utils/sentryScrubber';

export interface ErrorBoundaryProps {
  children: ReactNode;
  componentName?: string;
  onReportError?: (sanitizedMessage: string, componentStack: string) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  sanitizedMessage: string | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    hasError: false,
    sanitizedMessage: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      sanitizedMessage: scrubSensitiveString(error?.message || 'Unexpected rendering error'),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const cleanMsg = scrubSensitiveString(error?.message || 'Unknown error');
    const cleanStack = scrubSensitiveString(errorInfo?.componentStack || '');
    this.props.onReportError?.(cleanMsg, cleanStack);
  }

  public handleReloadComponent = (): void => {
    this.setState({ hasError: false, sanitizedMessage: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="error-boundary-fallback"
          data-sentry-mask="true"
          className="rounded-xl border border-rose-500/40 bg-slate-900 p-5 text-sm text-slate-100 shadow-lg"
        >
          <h3 className="font-semibold text-rose-300">
            Component Recovery Mode ({this.props.componentName || 'UI Module'})
          </h3>
          <p className="mt-1 text-xs text-slate-300">
            {this.state.sanitizedMessage}
          </p>
          <button
            type="button"
            data-testid="reload-component-button"
            onClick={this.handleReloadComponent}
            className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Reload Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
