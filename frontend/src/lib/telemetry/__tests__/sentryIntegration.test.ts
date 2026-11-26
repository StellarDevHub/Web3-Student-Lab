/**
 * End-to-end check against the real Sentry SDK (no mock): what actually goes out
 * on the wire for a crash. A capturing transport stands in for the network.
 */
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearBreadcrumbs, installBreadcrumbTracking, recordBreadcrumb } from '../breadcrumbs';
import { setTelemetryWallet } from '../context';
import { reportCrash, submitCrashFeedback } from '../crashReporter';
import { scrubBreadcrumb, scrubEvent } from '../redact';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const SECRET = `S${'A'.repeat(55)}`;

type EnvelopeItem = [{ type: string }, Record<string, any>];
const sent: EnvelopeItem[] = [];

function itemsOf(type: string): Array<Record<string, any>> {
  return sent.filter(([header]) => header.type === type).map(([, payload]) => payload);
}

describe('real Sentry SDK: crash reporting wire format (FE-099)', () => {
  let uninstall: () => void;

  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Sentry.init({
      dsn: 'https://publickey@o0.ingest.sentry.io/1',
      // Same scrubbing and settings as sentry.client.config.ts.
      sendDefaultPii: false,
      maxBreadcrumbs: 50,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
      transport: () => ({
        send: async (envelope: unknown) => {
          const [, items] = envelope as unknown as [unknown, EnvelopeItem[]];
          sent.push(...items);
          return {};
        },
        flush: async () => true,
      }),
    });
    clearBreadcrumbs();
    uninstall = installBreadcrumbTracking();
  });

  afterAll(() => {
    uninstall();
    setTelemetryWallet(null);
  });

  it('delivers the exception with component stack, recent actions, snapshot and a masked user', async () => {
    setTelemetryWallet(ACCOUNT, 'TESTNET');
    recordBreadcrumb({ category: 'app', message: `Opened wallet ${ACCOUNT}` });
    document.body.innerHTML = '<button id="run">Run contract</button>';
    document.getElementById('run')!.click();

    const error = new Error(`signing failed for ${ACCOUNT} using ${SECRET}`);
    const report = reportCrash({
      error,
      componentStack: '\n    at Signer (signer.tsx:9)\n    at Wallet (wallet.tsx:3)',
      componentName: 'WalletPanel',
    });
    await Sentry.flush(2000);

    const [event] = itemsOf('event');
    expect(event).toBeDefined();
    expect(event.event_id).toBe(report.sentryEventId?.replace(/-/g, ''));

    expect(event.tags).toMatchObject({ error_boundary: 'WalletPanel', crash_id: report.id });
    expect(event.contexts.react.componentStack).toContain('at Signer (signer.tsx:9)');
    expect(event.contexts.state_snapshot).toMatchObject({
      wallet: 'GAAA…AWHF',
      walletNetwork: 'TESTNET',
    });
    // Each action must arrive as readable text; nested objects here are flattened to "[Object]".
    const actions: string[] = event.contexts.recent_actions.actions;
    expect(actions.every((a) => typeof a === 'string' && a !== '[Object]')).toBe(true);
    expect(actions.some((a) => a.includes('ui.click: Clicked button "Run contract"'))).toBe(true);
    expect(actions.some((a) => a.includes('app: Opened wallet GAAA…AWHF'))).toBe(true);
    expect(event.user).toEqual({ id: 'GAAA…AWHF' });

    // Sentry's own breadcrumb trail rides on the event too.
    expect(event.breadcrumbs.length).toBeGreaterThan(0);
  });

  it('never puts the full address, the secret key, or default PII on the wire', async () => {
    await Sentry.flush(2000);
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain(ACCOUNT);
    expect(wire).not.toContain(SECRET);
    expect(wire).toContain('[redacted-secret]');
    expect(wire).not.toContain('ip_address');
  });

  it('delivers a crash report as user feedback linked to the crash event', async () => {
    const report = reportCrash({ error: new Error('another crash'), componentName: 'Lesson' });
    const result = submitCrashFeedback(report, `it froze for ${ACCOUNT}`);
    await Sentry.flush(2000);

    expect(result).toEqual({ delivered: true, recorded: true });
    const feedback = itemsOf('feedback').find((f) => f.contexts?.feedback?.associated_event_id);
    expect(feedback).toBeDefined();
    expect(feedback!.contexts.feedback.associated_event_id).toBe(
      report.sentryEventId?.replace(/-/g, '')
    );
    expect(feedback!.contexts.feedback.message).toContain('it froze for');
    expect(JSON.stringify(feedback)).not.toContain(ACCOUNT);
  });
});
