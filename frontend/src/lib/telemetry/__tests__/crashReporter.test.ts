import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { clearBreadcrumbs, recordBreadcrumb } from '../breadcrumbs';
import { setTelemetryWallet } from '../context';
import { MAX_FEEDBACK_LENGTH, reportCrash, submitCrashFeedback } from '../crashReporter';
import { getTelemetryErrors } from '@/lib/telemetry';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const MASKED = 'GAAA…AWHF';

function contextCall(name: string): Record<string, unknown> | undefined {
  const call = sentry.scope.setContext.mock.calls.find((c) => c[0] === name);
  return call?.[1] as Record<string, unknown> | undefined;
}

describe('reportCrash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearBreadcrumbs();
    setTelemetryWallet(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends the exception to Sentry with the component stack as a context', () => {
    const error = new Error('render exploded');
    const report = reportCrash({
      error,
      componentStack: '\n    at Chart (chart.tsx:10)\n    at Dashboard (dash.tsx:4)',
      componentName: 'Dashboard',
    });

    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(contextCall('react')).toEqual({
      componentStack: expect.stringContaining('at Chart (chart.tsx:10)'),
    });
    expect(sentry.scope.setTag).toHaveBeenCalledWith('error_boundary', 'Dashboard');
    expect(sentry.scope.setTag).toHaveBeenCalledWith('crash_id', report.id);
    expect(report.sentryEventId).toBe('sentry-event-1');
    expect(report.componentStack).toContain('at Chart');
  });

  it('attaches the recent-actions trail', () => {
    recordBreadcrumb({ category: 'app', message: 'Opened lesson 3' });
    recordBreadcrumb({ category: 'app', message: 'Ran the contract' });
    reportCrash({ error: new Error('x') });

    const recent = contextCall('recent_actions') as { count: number; actions: string[] };
    expect(recent.count).toBe(2);
    expect(recent.actions).toHaveLength(2);
    expect(recent.actions[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z app: Opened lesson 3$/);
    expect(recent.actions[1]).toMatch(/app: Ran the contract$/);
    // Strings, not objects: Sentry flattens nested objects in contexts to "[Object]".
    expect(recent.actions.every((a) => typeof a === 'string')).toBe(true);
  });

  it('attaches an allowlisted state snapshot', () => {
    reportCrash({ error: new Error('x') });
    const snapshot = contextCall('state_snapshot') as Record<string, unknown>;
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        'appVersion',
        'authenticated',
        'buildNumber',
        'capturedAt',
        'environment',
        'features',
        'locale',
        'networkType',
        'online',
        'route',
        'viewport',
        'wallet',
        'walletNetwork',
      ].sort()
    );
  });

  it('reports the wallet only in masked form, everywhere', () => {
    setTelemetryWallet(ACCOUNT, 'TESTNET');
    const report = reportCrash({
      error: new Error(`transfer failed for ${ACCOUNT}`),
      componentStack: `\n    at Wallet (${ACCOUNT}.tsx)`,
    });

    expect(sentry.scope.setUser).toHaveBeenCalledWith({ id: MASKED });
    expect(report.wallet).toBe(MASKED);
    expect((contextCall('state_snapshot') as { wallet: string }).wallet).toBe(MASKED);
    expect((contextCall('state_snapshot') as { walletNetwork: string }).walletNetwork).toBe(
      'TESTNET'
    );

    // The full address must not appear in anything handed to Sentry's scope.
    const everything = JSON.stringify([
      sentry.scope.setContext.mock.calls,
      sentry.scope.setUser.mock.calls,
      sentry.scope.setTag.mock.calls,
    ]);
    expect(everything).not.toContain(ACCOUNT);
  });

  it('sets no user when no wallet is connected', () => {
    reportCrash({ error: new Error('x') });
    expect(sentry.scope.setUser).not.toHaveBeenCalled();
  });

  it('logs the crash to the session with the component stack from errorInfo', () => {
    const report = reportCrash({
      error: new Error('x'),
      componentStack: '\n    at Foo (foo.tsx:1)',
      componentName: 'Foo',
    });
    const logged = getTelemetryErrors().find((e) => e.id === report.id);
    expect(logged?.componentStack).toContain('at Foo (foo.tsx:1)');
  });

  it('reports a given error object once, however often it is delivered', () => {
    const error = new Error('delivered twice');
    const first = reportCrash({ error });
    const second = reportCrash({ error });
    expect(second).toBe(first);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(getTelemetryErrors()).toHaveLength(1);
  });

  it('still returns a report if Sentry throws, instead of throwing into a crashed UI', () => {
    sentry.withScope.mockImplementationOnce(() => {
      throw new Error('sentry exploded');
    });
    const report = reportCrash({ error: new Error('x') });
    expect(report.id).toBeTruthy();
    expect(report.sentryEventId).toBeNull();
  });
});

describe('submitCrashFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearBreadcrumbs();
    setTelemetryWallet(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sentry.getClient.mockReturnValue({
      getOptions: () => ({ dsn: 'https://key@o0.ingest.sentry.io/1' }),
    });
  });

  function freshReport() {
    return reportCrash({ error: new Error(`crash ${Math.random()}`), componentName: 'Editor' });
  }

  it('sends the comment to Sentry linked to the crash event', () => {
    const report = freshReport();
    const result = submitCrashFeedback(report, 'I pressed run twice');
    expect(result).toEqual({ delivered: true, recorded: true });
    expect(sentry.captureFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'I pressed run twice',
        associatedEventId: 'sentry-event-1',
        tags: { crash_id: report.id, error_boundary: 'Editor' },
      })
    );
  });

  it('scrubs addresses, secrets and emails out of the comment', () => {
    const secret = `S${'A'.repeat(55)}`;
    submitCrashFeedback(freshReport(), `my wallet ${ACCOUNT} key ${secret} mail me@example.com`);
    const sent = JSON.stringify(sentry.captureFeedback.mock.calls);
    expect(sent).not.toContain(ACCOUNT);
    expect(sent).not.toContain(secret);
    expect(sent).not.toContain('me@example.com');
    expect(sent).toContain(MASKED);
  });

  it('caps the comment length', () => {
    submitCrashFeedback(freshReport(), 'a'.repeat(5000));
    const [params] = sentry.captureFeedback.mock.calls[0] as unknown as [{ message: string }];
    expect(params.message).toHaveLength(MAX_FEEDBACK_LENGTH);
  });

  it('records nothing for an empty comment', () => {
    const result = submitCrashFeedback(freshReport(), '   ');
    expect(result).toEqual({ delivered: false, recorded: false });
    expect(sentry.captureFeedback).not.toHaveBeenCalled();
  });

  it('saves the comment locally and says it was not delivered when no DSN is configured', () => {
    sentry.getClient.mockReturnValue({ getOptions: () => ({ dsn: undefined }) });
    const report = freshReport();
    const result = submitCrashFeedback(report, 'it broke');

    expect(result).toEqual({ delivered: false, recorded: true });
    expect(sentry.captureFeedback).not.toHaveBeenCalled();
    const saved = JSON.parse(sessionStorage.getItem('soroban_crash_feedback') || '[]');
    expect(saved).toEqual([expect.objectContaining({ reportId: report.id, message: 'it broke' })]);
  });

  it('marks the crash as reported in the session log', () => {
    const report = freshReport();
    submitCrashFeedback(report, 'it broke');
    expect(getTelemetryErrors().find((e) => e.id === report.id)?.recoveryAction).toBe('report');
  });

  it('reports not delivered (but recorded) if Sentry throws', () => {
    sentry.captureFeedback.mockImplementationOnce(() => {
      throw new Error('network');
    });
    expect(submitCrashFeedback(freshReport(), 'it broke')).toEqual({
      delivered: false,
      recorded: true,
    });
  });
});
