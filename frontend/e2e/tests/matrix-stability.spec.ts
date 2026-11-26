/**
 * FE-091: smoke tests that exercise the new wallet-mock fixtures across
 * the full Playwright project matrix (chromium / firefox / webkit /
 * mobile-chrome / mobile-safari).
 *
 * The specs are deliberately small: they assert that the fixtures do what
 * the matrix specs below them rely on. If webkit swallows an `offline`
 * dispatch here, every downstream offline test will flake the same way.
 */

import { expect, test } from '../fixtures/web3.fixture';
import {
  goOffline,
  goOnline,
  installLearnerApiStub,
  suppressBlockingModals,
} from '../fixtures/walletMock';

test.describe('matrix stability fixtures', () => {
  test.beforeEach(async ({ page }) => {
    await suppressBlockingModals(page);
    await installLearnerApiStub(page);
  });

  test('home renders on every project', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Web3 Student/i })).toBeVisible();
  });

  test('offline/online retry helpers converge even on webkit', async ({ page, context }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await goOffline(page, context);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    await goOnline(page, context);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  });
});
