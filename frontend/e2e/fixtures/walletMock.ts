/**
 * Synthetic wallet mocking fixtures for the Playwright matrix (FE-091).
 *
 * The existing `web3.fixture` installs a full `window.freighter` / `ethereum`
 * surface. This file adds small, focused helpers for the matrix-stability
 * tests that need:
 *   - deterministic network latency injection on API routes
 *   - strict auto-retry wrappers for webkit offline dispatch (webkit swallows
 *     the first `online` / `offline` Event dispatched right after
 *     `context.setOffline()`)
 *   - a reusable "suppress the render-warning modal" seed
 *
 * All helpers are composable and framework-agnostic: they take a `Page` and
 * return promises, so individual specs can opt in rather than paying for them
 * on every run.
 */

import type { BrowserContext, Page, Route } from '@playwright/test';

/** Session/local-storage keys the render-warning modal reads on mount. */
export const RENDER_WARNING_KEYS = ['render_warning_seen'] as const;

/**
 * Adds an init script that marks every blocking first-visit modal as seen so
 * subsequent locator.click()s are not intercepted by a full-viewport overlay.
 */
export async function suppressBlockingModals(page: Page | BrowserContext): Promise<void> {
  await page.addInitScript((keys) => {
    for (const key of keys) {
      try {
        window.sessionStorage.setItem(key, 'true');
        window.localStorage.setItem(key, 'true');
      } catch {
        // Private mode / storage-disabled contexts: carry on.
      }
    }
  }, RENDER_WARNING_KEYS);
}

/**
 * Delays every response matching `pattern` by `delayMs` milliseconds.
 * Deterministic: uses `setTimeout` on the Playwright side so the delay is not
 * subject to the browser's event loop variability.
 */
export async function injectLatency(
  page: Page,
  pattern: string | RegExp,
  delayMs: number,
): Promise<void> {
  await page.route(pattern, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

/**
 * Takes the page offline *and* dispatches an `offline` event, retrying up to
 * `attempts` times until `navigator.onLine === false`. webkit occasionally
 * swallows the first dispatch, which causes flake in `offline.spec.ts`.
 */
export async function goOffline(
  page: Page,
  context: BrowserContext,
  attempts = 3,
): Promise<void> {
  await context.setOffline(true);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const applied = await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      return !navigator.onLine;
    });
    if (applied) return;
  }
  throw new Error('page did not go offline within the retry budget');
}

/** Counterpart of {@link goOffline}. Same retry behaviour. */
export async function goOnline(
  page: Page,
  context: BrowserContext,
  attempts = 3,
): Promise<void> {
  await context.setOffline(false);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const applied = await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      return navigator.onLine;
    });
    if (applied) return;
  }
  throw new Error('page did not go online within the retry budget');
}

/**
 * Serves a stable, synthetic learner identity to the mocked API so journey
 * specs (login → enrollment → compile → certificate) do not depend on a real
 * backend. Each route is stubbed with a 200 JSON body; routes not matched
 * fall through to the normal request chain.
 */
export const SYNTHETIC_LEARNER = {
  id: 'learner-fe091',
  email: 'learner@example.test',
  fullName: 'FE-091 Learner',
} as const;

export async function installLearnerApiStub(page: Page): Promise<void> {
  const respond = (body: unknown) => async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  };

  await page.route(/\/api\/v1\/auth\/me(?:\?|$)/, respond({ user: SYNTHETIC_LEARNER }));
  await page.route(/\/api\/v1\/courses(?:\?|$)/, respond({ courses: [] }));
}
