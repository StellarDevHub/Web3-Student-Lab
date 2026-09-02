import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/web3.fixture';

/**
 * E2E coverage for the Web3 authentication journey and protected-route
 * behavior. Everything here is deterministic: wallet providers are injected
 * via `window.freighterApi` (see e2e/fixtures/web3.fixture.ts) and the
 * backend is never hit for real — `/auth/me` is mocked per test via
 * page.route(). No real wallet extension, private key, or network is
 * required to run this file.
 *
 * Two independent gates stack in this app: `WalletGate` (src/components/
 * layout/WalletGate.tsx) blocks every route except `/` behind a connected
 * Stellar wallet (`stellar_wallet` in localStorage), and `RoleGuard` (src/
 * components/auth/RoleGuard.tsx) separately gates by the backend-issued
 * user/role (`token`/`user` in localStorage, verified via GET /auth/me).
 * Tests that exercise anything past the wallet gate seed `stellar_wallet`
 * directly, the same way the pre-existing wallet.spec.ts does.
 */

const AUTH_ME_PATTERN = '**/api/v1/auth/me';
const MOCK_TOKEN = 'mock-jwt-token';

test.beforeEach(async ({ page }) => {
  // Suppress the "Backend Warming Up" modal (RenderWarningModal), which
  // otherwise covers the whole viewport on every fresh session and blocks
  // clicks — unrelated to anything under test here.
  await page.addInitScript(() => {
    window.sessionStorage.setItem('render_warning_seen', 'true');
  });
});

function mockCurrentUser(page: Page, user: Record<string, unknown> | null) {
  return page.route(AUTH_ME_PATTERN, (route) => {
    if (user) {
      return route.fulfill({ status: 200, json: { user } });
    }
    return route.fulfill({ status: 401, json: { error: 'jwt expired' } });
  });
}

/**
 * Seeds a connected wallet + authenticated session and (re)loads `path`.
 *
 * `stellar_wallet` is seeded via page.addInitScript() so it survives the
 * single per-page localStorage clear that the web3 fixture installs, and
 * survives the reload below. `token`/`user` are deliberately seeded with
 * page.evaluate() AFTER the first load: re-seeding them via init script
 * would silently re-set them right after a logout or session-expiry
 * redirect clears them — exactly the state these tests need to observe.
 */
async function loginAs(page: Page, path: string, user: Record<string, unknown>) {
  await page.addInitScript(
    (pk: string) => {
      window.localStorage.setItem(
        'stellar_wallet',
        JSON.stringify({ wallet: 'Freighter', pk })
      );
    },
    'GMOCKPUBLICKEY'
  );

  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ token, user: seededUser }) => {
      window.localStorage.setItem('token', token);
      window.localStorage.setItem('user', JSON.stringify(seededUser));
    },
    { token: MOCK_TOKEN, user }
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
}

const MOCK_WALLET_ADDRESS = 'GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT';

test.describe('wallet authentication journey', () => {
  // Uses the app's own built-in "Dev Mock Wallet" provider (src/contexts/
  // WalletContext.tsx) instead of injecting a Freighter mock: the real
  // @stellar/freighter-api package does its own internal detection that a
  // hand-rolled window.freighterApi shim doesn't reliably satisfy, so
  // exercising it end-to-end through a UI click isn't deterministic. The
  // dev mock wallet is a real, always-available code path with no external
  // dependency, so clicking it genuinely exercises WalletContext.connect()
  // and WalletGate end-to-end.
  test('connecting the dev mock wallet unlocks the app behind WalletGate', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Every route but "/" is blocked behind WalletGate until a wallet connects.
    await expect(page.getByRole('heading', { name: /Authentication Required/i })).toBeVisible();

    await page.getByRole('button', { name: /Dev Mock Wallet/ }).click();

    // Once connected, WalletGate renders the real /dashboard page underneath.
    await expect(page.getByRole('heading', { name: /Authentication Required/i })).not.toBeVisible();

    const storedWallet = await page.evaluate(() => window.localStorage.getItem('stellar_wallet'));
    expect(JSON.parse(storedWallet ?? '{}')).toMatchObject({
      wallet: 'Dev Mock Wallet',
      pk: MOCK_WALLET_ADDRESS,
    });
  });

  // Albedo/Rabet throw synchronously when their window global isn't present
  // (see WalletContext.tsx's albedoAdapter/rabetAdapter) — a real,
  // deterministic failure path with no mocking required at all.
  test('recovers gracefully, without unlocking the app, when a wallet connection fails', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const connectButton = page.getByRole('button', { name: /Albedo/ });
    await connectButton.click();

    // The gate stays up — no crash, no silent false "connected" state — and
    // the button recovers to a re-clickable state instead of hanging on
    // "Connecting...".
    await expect(page.getByRole('heading', { name: /Authentication Required/i })).toBeVisible();
    await expect(connectButton).toBeEnabled();

    const storedWallet = await page.evaluate(() => window.localStorage.getItem('stellar_wallet'));
    expect(storedWallet).toBeNull();
  });
});

test.describe('protected-route access', () => {
  test('grants access to a role-gated route for an authenticated, authorized user', async ({ page }) => {
    const user = { id: 'user-1', email: 'admin@example.com', role: 'administrator' };
    await mockCurrentUser(page, user);
    await loginAs(page, '/simulator', user);

    await expect(page.getByRole('heading', { name: /Network Simulator/i })).toBeVisible();
    await expect(page.getByText(/access denied/i)).not.toBeVisible();
    await expect(page.getByLabel(/sign out/i)).toBeVisible();
  });

  test('denies a role-gated route to an authenticated user without the required role', async ({ page }) => {
    const user = { id: 'user-2', email: 'mentor@example.com', role: 'instructor' };
    await mockCurrentUser(page, user);
    await loginAs(page, '/simulator', user);

    await expect(page.getByText(/access denied/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Network Simulator/i })).not.toBeVisible();
  });
});

test.describe('session recovery and logout', () => {
  test('recovers safely when the session has expired: clears storage and returns to login', async ({ page }) => {
    const user = { id: 'user-3', email: 'student@example.com', role: 'student' };
    await mockCurrentUser(page, null); // /auth/me now rejects with 401
    await loginAs(page, '/simulator', user);

    await page.waitForURL('**/auth/login');
    const [token, storedUser] = await page.evaluate(() => [
      window.localStorage.getItem('token'),
      window.localStorage.getItem('user'),
    ]);
    expect(token).toBeNull();
    expect(storedUser).toBeNull();

    // The wallet connection itself is untouched by an expired backend session.
    const storedWallet = await page.evaluate(() => window.localStorage.getItem('stellar_wallet'));
    expect(storedWallet).not.toBeNull();
  });

  test('logs out from an authenticated session and clears local state', async ({ page }) => {
    const user = { id: 'user-4', email: 'admin@example.com', role: 'administrator' };
    await mockCurrentUser(page, user);
    await loginAs(page, '/simulator', user);
    await expect(page.getByLabel(/sign out/i)).toBeVisible();

    await page.getByLabel(/sign out/i).click();

    await page.waitForURL('**/auth/login');
    const [token, storedUser] = await page.evaluate(() => [
      window.localStorage.getItem('token'),
      window.localStorage.getItem('user'),
    ]);
    expect(token).toBeNull();
    expect(storedUser).toBeNull();
  });
});
