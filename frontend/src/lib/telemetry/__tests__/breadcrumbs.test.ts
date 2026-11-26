import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ addBreadcrumb: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

import {
  MAX_BREADCRUMBS,
  clearBreadcrumbs,
  describeElement,
  getBreadcrumbs,
  installBreadcrumbTracking,
  recordBreadcrumb,
} from '../breadcrumbs';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('breadcrumbs', () => {
  beforeEach(() => {
    clearBreadcrumbs();
    sentry.addBreadcrumb.mockClear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    installBreadcrumbTracking()(); // uninstall, whatever state a test left it in
  });

  describe('recordBreadcrumb', () => {
    it('records an action and forwards it to Sentry', () => {
      recordBreadcrumb({ category: 'app', message: 'Opened the editor' });
      expect(getBreadcrumbs()).toEqual([
        expect.objectContaining({ category: 'app', message: 'Opened the editor', level: 'info' }),
      ]);
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'app', message: 'Opened the editor', level: 'info' })
      );
    });

    it('redacts the message and data before storing or forwarding', () => {
      recordBreadcrumb({
        category: 'wallet',
        message: `Connected ${ACCOUNT}`,
        data: { token: 'abc', network: 'TESTNET' },
      });
      const [crumb] = getBreadcrumbs();
      expect(crumb.message).not.toContain(ACCOUNT);
      expect(crumb.data).toEqual({ token: '[redacted]', network: 'TESTNET' });
      expect(JSON.stringify(sentry.addBreadcrumb.mock.calls)).not.toContain(ACCOUNT);
    });

    it('keeps only the most recent actions', () => {
      for (let i = 0; i < MAX_BREADCRUMBS + 10; i += 1) {
        recordBreadcrumb({ category: 'app', message: `step ${i}` });
      }
      const crumbs = getBreadcrumbs();
      expect(crumbs).toHaveLength(MAX_BREADCRUMBS);
      expect(crumbs[0].message).toBe('step 10');
      expect(crumbs[crumbs.length - 1].message).toBe(`step ${MAX_BREADCRUMBS + 9}`);
    });

    it('does not let callers mutate the buffer', () => {
      recordBreadcrumb({ category: 'app', message: 'one' });
      getBreadcrumbs()[0].message = 'tampered';
      expect(getBreadcrumbs()[0].message).toBe('one');
    });

    it('does not throw if Sentry does', () => {
      sentry.addBreadcrumb.mockImplementationOnce(() => {
        throw new Error('sentry down');
      });
      expect(() => recordBreadcrumb({ category: 'app', message: 'x' })).not.toThrow();
      expect(getBreadcrumbs()).toHaveLength(1);
    });
  });

  describe('describeElement', () => {
    function el(html: string): Element {
      document.body.innerHTML = html;
      return document.body.firstElementChild as Element;
    }

    it('describes a button by its text', () => {
      expect(describeElement(el('<button>Deploy contract</button>'))).toBe(
        'Clicked button "Deploy contract"'
      );
    });

    it('prefers aria-label and data-breadcrumb over text', () => {
      expect(describeElement(el('<button aria-label="Close">x</button>'))).toBe(
        'Clicked button "Close"'
      );
      expect(describeElement(el('<button data-breadcrumb="Run tests">go</button>'))).toBe(
        'Clicked button "Run tests"'
      );
    });

    it('resolves a click on a child to the interactive ancestor', () => {
      document.body.innerHTML = '<a href="/x"><span id="inner">Next lesson</span></a>';
      expect(describeElement(document.getElementById('inner'))).toBe('Clicked link "Next lesson"');
    });

    it('describes an input by name, never by its value', () => {
      const out = describeElement(el('<input name="amount" value="123456 secret" />'));
      expect(out).toBe('Clicked input "amount"');
      expect(out).not.toContain('secret');
    });

    it('never describes a password field', () => {
      expect(describeElement(el('<input type="password" name="pw" />'))).toBeNull();
    });

    it('ignores clicks on non-interactive elements', () => {
      expect(describeElement(el('<div>just text</div>'))).toBeNull();
      expect(describeElement(null)).toBeNull();
    });

    it('clips long labels and redacts addresses in them', () => {
      const out = describeElement(el(`<button>${ACCOUNT} ${'x'.repeat(100)}</button>`)) as string;
      // Not even a fragment: clipping before redacting would cut the address short
      // enough to dodge the pattern and leave 40 characters of it in the trail.
      expect(out).not.toContain(ACCOUNT.slice(0, 20));
      expect(out).toContain('GAAA…AWHF');
      expect(out.length).toBeLessThan(80);
    });
  });

  describe('installBreadcrumbTracking', () => {
    it('records clicks without forwarding them to Sentry (its own integration covers those)', () => {
      installBreadcrumbTracking();
      document.body.innerHTML = '<button id="b">Save</button>';
      document.getElementById('b')!.click();
      expect(getBreadcrumbs().map((c) => c.message)).toContain('Clicked button "Save"');
      expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('records navigation as a path with the query reduced to a marker', () => {
      installBreadcrumbTracking();
      window.history.pushState({}, '', '/courses/7?token=abc#frag');
      const nav = getBreadcrumbs().find((c) => c.category === 'navigation');
      expect(nav?.message).toBe('Navigated to /courses/7?[redacted]');
      expect(JSON.stringify(getBreadcrumbs())).not.toContain('abc');
      window.history.pushState({}, '', '/');
    });

    it('records going offline and back online', () => {
      installBreadcrumbTracking();
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      expect(getBreadcrumbs().map((c) => c.message)).toEqual(['Went offline', 'Back online']);
      expect(getBreadcrumbs()[0].level).toBe('warning');
    });

    it('is idempotent: a second install does not double-record', () => {
      installBreadcrumbTracking();
      installBreadcrumbTracking();
      document.body.innerHTML = '<button id="b">Save</button>';
      document.getElementById('b')!.click();
      expect(getBreadcrumbs().filter((c) => c.category === 'ui.click')).toHaveLength(1);
    });

    it('stops recording and restores history after teardown', () => {
      const originalPush = window.history.pushState;
      const uninstall = installBreadcrumbTracking();
      expect(window.history.pushState).not.toBe(originalPush);
      uninstall();
      expect(window.history.pushState).toBe(originalPush);

      document.body.innerHTML = '<button id="b">Save</button>';
      document.getElementById('b')!.click();
      expect(getBreadcrumbs()).toEqual([]);
    });
  });
});
