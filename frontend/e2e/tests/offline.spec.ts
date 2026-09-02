import { expect, test } from '../fixtures/web3.fixture';

test.beforeEach(async ({ page }) => {
  // Suppress the "Backend Warming Up" modal (RenderWarningModal), which
  // otherwise covers the whole viewport on every fresh session — unrelated
  // to anything under test here.
  await page.addInitScript(() => {
    window.sessionStorage.setItem('render_warning_seen', 'true');
  });
});

test.describe('offline experience', () => {
  test('shows an accessible offline banner when connectivity drops, and clears it when restored', async ({
    page,
    context,
  }) => {
    // "/" is the one route WalletGate never blocks, so this exercises the
    // banner without needing a connected wallet.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Launch App' })).toBeVisible();
    // context.setOffline() only fires the browser's 'offline' event once,
    // and the home page ships a much heavier client bundle than /offline —
    // server-rendered markup like the button above can be visible before
    // hydration (and therefore the offline/online listeners) is ready, so
    // give it time to finish before toggling and manually re-dispatching.
    await page.waitForTimeout(2000);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const notice = page.getByRole('status');
    await expect(notice).toContainText('Offline Mode');

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(notice).toContainText('Back Online');
  });

  test('does not repeat the offline notice while the connection stays down', async ({ page, context }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Launch App' })).toBeVisible();
    // The home page ships a much heavier client bundle than /offline; give
    // it time to finish hydrating so the offline/online listeners are
    // actually attached (server-rendered markup like the button above can
    // be visible before hydration completes).
    await page.waitForTimeout(2000);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByRole('status')).toContainText('Offline Mode');

    // Simulate flapping network detail events without an actual state
    // change — should still be exactly one notice, not a stack of them.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));
    });
    await expect(page.getByText('Offline Mode')).toHaveCount(1);
  });

  test('the offline recovery page stays reachable with no wallet connected, and reflects live connectivity', async ({
    page,
    context,
  }) => {
    await page.goto('/offline', { waitUntil: 'domcontentloaded' });

    // WalletGate would otherwise redirect every non-"/" route to its own
    // "Authentication Required" screen for a disconnected wallet.
    await expect(page.getByRole('heading', { name: /authentication required/i })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /back online/i })).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByRole('heading', { name: /you're offline/i })).toBeVisible();
    await expect(page.getByText('Available offline')).toBeVisible();
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole('heading', { name: /back online/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /reload now/i })).toBeVisible();
  });
});
