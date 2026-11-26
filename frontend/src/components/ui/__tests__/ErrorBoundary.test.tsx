import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => {
  const scope = {
    setLevel: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn(),
  };
  return {
    scope,
    withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
    captureException: vi.fn((_error?: unknown) => 'sentry-event-1'),
    captureFeedback: vi.fn(() => 'feedback-1'),
    addBreadcrumb: vi.fn(),
    getClient: vi.fn((): { getOptions: () => { dsn?: string } } => ({
      getOptions: () => ({ dsn: 'https://key@o0.ingest.sentry.io/1' }),
    })),
  };
});
vi.mock('@sentry/nextjs', () => sentry);

import { ErrorBoundary } from '../ErrorBoundary';
import { clearBreadcrumbs, installBreadcrumbTracking } from '@/lib/telemetry/breadcrumbs';
import { setTelemetryWallet } from '@/lib/telemetry/context';
import { getTelemetryErrors } from '@/lib/telemetry';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

function Bomb({ message = 'kaboom' }: { message?: string }): React.ReactElement {
  throw new Error(message);
}

function contextCall(name: string): Record<string, any> | undefined {
  const call = sentry.scope.setContext.mock.calls.find((c) => c[0] === name);
  return call?.[1] as Record<string, any> | undefined;
}

describe('ErrorBoundary (FE-099)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearBreadcrumbs();
    setTelemetryWallet(null);
    sentry.getClient.mockReturnValue({
      getOptions: () => ({ dsn: 'https://key@o0.ingest.sentry.io/1' }),
    });
    // React logs caught errors loudly; the tests assert on behavior instead.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    installBreadcrumbTracking()();
    vi.unstubAllEnvs();
  });

  describe('isolation', () => {
    it('replaces only the faulty component; the rest of the layout stays interactive', () => {
      function Page() {
        const [count, setCount] = useState(0);
        return (
          <div>
            <button onClick={() => setCount((c) => c + 1)}>Outside count: {count}</button>
            <ErrorBoundary componentName="Faulty">
              <Bomb />
            </ErrorBoundary>
            <ErrorBoundary componentName="Healthy">
              <p>Healthy sibling</p>
            </ErrorBoundary>
          </div>
        );
      }
      render(<Page />);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('Healthy sibling')).toBeInTheDocument();

      const outside = screen.getByRole('button', { name: /outside count: 0/i });
      fireEvent.click(outside);
      expect(screen.getByRole('button', { name: /outside count: 1/i })).toBeInTheDocument();
      // The crash did not take the page down with it.
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('renders children untouched when nothing throws', () => {
      render(
        <ErrorBoundary>
          <p>All good</p>
        </ErrorBoundary>
      );
      expect(screen.getByText('All good')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('Sentry', () => {
    it('captures the exception with the React component stack', () => {
      function Inner(): React.ReactElement {
        throw new Error('deep failure');
      }
      function Middle() {
        return <Inner />;
      }
      render(
        <ErrorBoundary componentName="Lesson">
          <Middle />
        </ErrorBoundary>
      );

      expect(sentry.captureException).toHaveBeenCalledTimes(1);
      expect(sentry.captureException.mock.calls[0][0]).toEqual(
        expect.objectContaining({ message: 'deep failure' })
      );
      const react = contextCall('react');
      expect(react?.componentStack).toContain('Inner');
      expect(react?.componentStack).toContain('Middle');
      expect(sentry.scope.setTag).toHaveBeenCalledWith('error_boundary', 'Lesson');
    });

    it('also logs the component stack to the session telemetry (it was never recorded before)', () => {
      render(
        <ErrorBoundary componentName="Lesson">
          <Bomb />
        </ErrorBoundary>
      );
      expect(getTelemetryErrors()[0].componentStack).toContain('Bomb');
    });

    it('attaches the recent user actions as breadcrumbs', () => {
      function Trigger() {
        const [open, setOpen] = useState(false);
        return open ? <Bomb /> : <button onClick={() => setOpen(true)}>Open the editor</button>;
      }
      render(
        <ErrorBoundary componentName="Editor">
          <Trigger />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Open the editor' }));

      const recent = contextCall('recent_actions');
      expect(
        recent?.actions.some((a: string) =>
          a.includes('ui.click: Clicked button "Open the editor"')
        )
      ).toBe(true);
    });

    it('attaches the active wallet, masked, and never the full address', () => {
      setTelemetryWallet(ACCOUNT, 'TESTNET');
      render(
        <ErrorBoundary componentName="Wallet">
          <Bomb message={`could not sign for ${ACCOUNT}`} />
        </ErrorBoundary>
      );

      expect(sentry.scope.setUser).toHaveBeenCalledWith({ id: 'GAAA…AWHF' });
      expect(contextCall('state_snapshot')?.wallet).toBe('GAAA…AWHF');
      expect(
        JSON.stringify([
          sentry.scope.setContext.mock.calls,
          sentry.scope.setTag.mock.calls,
          sentry.scope.setUser.mock.calls,
        ])
      ).not.toContain(ACCOUNT);
    });

    it('still renders the fallback if Sentry itself fails', () => {
      sentry.withScope.mockImplementationOnce(() => {
        throw new Error('sentry is down');
      });
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });

  describe('recovery', () => {
    it('shows "Reset & Try Again" and remounts the component when clicked', () => {
      let shouldThrow = true;
      function Flaky() {
        if (shouldThrow) throw new Error('first render fails');
        return <p>Recovered content</p>;
      }
      render(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      );

      shouldThrow = false;
      fireEvent.click(screen.getByRole('button', { name: 'Reset & Try Again' }));

      expect(screen.getByText('Recovered content')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('records the reset on the crash and in the trail', () => {
      render(
        <ErrorBoundary componentName="Editor">
          <Bomb />
        </ErrorBoundary>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reset & Try Again' }));

      expect(getTelemetryErrors()[0].recoveryAction).toBe('reset');
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Reset Editor after a crash' })
      );
    });

    it('reports a fresh crash if the reset hits the same error again', () => {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reset & Try Again' }));

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(sentry.captureException).toHaveBeenCalledTimes(2);
    });

    it('resets automatically when a resetKey changes', () => {
      const { rerender } = render(
        <ErrorBoundary resetKeys={['a']}>
          <Bomb />
        </ErrorBoundary>
      );
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      rerender(
        <ErrorBoundary resetKeys={['b']}>
          <p>Fine now</p>
        </ErrorBoundary>
      );
      expect(screen.getByText('Fine now')).toBeInTheDocument();
    });

    it('keeps the existing rescue, export and navigation actions', () => {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      expect(screen.getByRole('button', { name: /rescue session/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export state/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    });

    it('shows the crash reference', () => {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      const id = getTelemetryErrors()[0].id;
      expect(screen.getByText(id.slice(0, 8))).toBeInTheDocument();
    });
  });

  describe('crash report', () => {
    function openForm() {
      fireEvent.click(screen.getByRole('button', { name: /send crash report/i }));
    }

    it('lets the student submit a brief report that reaches Sentry, linked to the crash', async () => {
      render(
        <ErrorBoundary componentName="Editor">
          <Bomb />
        </ErrorBoundary>
      );
      openForm();
      fireEvent.change(screen.getByLabelText(/what were you doing/i), {
        target: { value: 'Pressed run, then it went blank' },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

      expect(await screen.findByRole('status')).toHaveTextContent('your report was sent');
      expect(sentry.captureFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Pressed run, then it went blank',
          associatedEventId: 'sentry-event-1',
        })
      );
    });

    it('scrubs the comment before it is sent', async () => {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      openForm();
      fireEvent.change(screen.getByLabelText(/what were you doing/i), {
        target: { value: `wallet ${ACCOUNT} email me@example.com` },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit report/i }));
      await screen.findByRole('status');

      const sent = JSON.stringify(sentry.captureFeedback.mock.calls);
      expect(sent).not.toContain(ACCOUNT);
      expect(sent).not.toContain('me@example.com');
    });

    it('does not claim delivery when no DSN is configured', async () => {
      sentry.getClient.mockReturnValue({ getOptions: () => ({ dsn: undefined }) });
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      openForm();
      fireEvent.change(screen.getByLabelText(/what were you doing/i), {
        target: { value: 'it broke' },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/saved on this device/i);
      expect(sentry.captureFeedback).not.toHaveBeenCalled();
    });

    it('will not submit an empty report', () => {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      openForm();
      expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled();
    });

    it('can be cancelled without sending anything', () => {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      openForm();
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByLabelText(/what were you doing/i)).not.toBeInTheDocument();
      expect(sentry.captureFeedback).not.toHaveBeenCalled();
    });
  });

  describe('details visibility', () => {
    it('hides the error message and component stack in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      render(
        <ErrorBoundary>
          <Bomb message="database password is hunter2" />
        </ErrorBoundary>
      );
      expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    });

    it('shows the message and component stack in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      render(
        <ErrorBoundary>
          <Bomb message="dev-visible failure" />
        </ErrorBoundary>
      );
      expect(screen.getByText('dev-visible failure')).toBeInTheDocument();
      expect(screen.getByText(/at Bomb/)).toBeInTheDocument();
    });
  });

  describe('custom fallback and callbacks', () => {
    it('calls onError with the error and errorInfo', () => {
      const onError = vi.fn();
      render(
        <ErrorBoundary onError={onError}>
          <Bomb />
        </ErrorBoundary>
      );
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'kaboom' }),
        expect.objectContaining({ componentStack: expect.any(String) })
      );
    });

    it('passes the report and helpers to a custom fallback function', async () => {
      render(
        <ErrorBoundary
          fallback={(error, reset, helpers) => (
            <div>
              <p>custom: {error.message}</p>
              <p>ref: {helpers.report?.id.slice(0, 8)}</p>
              <button onClick={reset}>custom reset</button>
            </div>
          )}
        >
          <Bomb />
        </ErrorBoundary>
      );
      expect(screen.getByText('custom: kaboom')).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByText(`ref: ${getTelemetryErrors()[0].id.slice(0, 8)}`)
        ).toBeInTheDocument()
      );
    });

    it('renders a static fallback node', () => {
      render(
        <ErrorBoundary fallback={<p>static fallback</p>}>
          <Bomb />
        </ErrorBoundary>
      );
      expect(screen.getByText('static fallback')).toBeInTheDocument();
    });
  });
});
