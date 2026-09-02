import { expect, test } from '../fixtures/web3.fixture';

test.describe('mobile-first responsive layout', () => {
  test.describe('home page', () => {
    test('renders without horizontal overflow on any viewport', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { name: /Web3 Student/i })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    });

    test('primary CTA buttons are reachable on mobile', async ({ page }) => {
      const viewport = page.viewportSize();
      test.skip(!(viewport && viewport.width < 768), 'Mobile-only test');

      await page.goto('/', { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('link', { name: /Launch App/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /View Source/i })).toBeVisible();
    });

    test('feature cards stay within viewport width on mobile', async ({ page }) => {
      const viewport = page.viewportSize();
      test.skip(!(viewport && viewport.width < 768), 'Mobile-only test');

      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const cards = page.locator('main > div > div.grid > a, main > div > div.grid > div');
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(3);

      const vw = viewport!.width;
      for (let i = 0; i < count; i++) {
        const box = await cards.nth(i).boundingBox();
        if (box) {
          expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
        }
      }
    });
  });

  test.describe('mobile navigation', () => {
    test('hamburger menu toggles and displays navigation links', async ({ page }) => {
      const viewport = page.viewportSize();
      test.skip(!(viewport && viewport.width < 768), 'Mobile-only test');

      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const openButton = page.getByLabel('Open menu');
      await expect(openButton).toBeVisible();
      await openButton.click();

      await expect(page.getByLabel('Close menu')).toBeVisible();

      await expect(page.getByText('Learn').first()).toBeVisible();
      await expect(page.getByText('Dashboard').first()).toBeVisible();

      await page.getByLabel('Close menu').click();

      await expect(page.getByLabel('Open menu')).toBeVisible();
    });

    test('desktop nav does not show hamburger menu button', async ({ page }) => {
      const viewport = page.viewportSize();
      test.skip(!(viewport && viewport.width >= 768), 'Desktop-only test');

      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const menuButton = page.getByLabel('Open menu');
      const isButtonVisible = await menuButton.isVisible().catch(() => false);
      expect(isButtonVisible).toBe(false);
    });
  });

  test.describe('wallet authentication prompt', () => {
    test('connect wallet options render without overflow', async ({ page }) => {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { name: /Authentication Required/i })).toBeVisible();
      await expect(page.getByText('Freighter').first()).toBeVisible();
      await expect(page.getByText('Albedo').first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    });

    test('wallet connect buttons remain within viewport on mobile', async ({
      page,
    }) => {
      const viewport = page.viewportSize();
      test.skip(!(viewport && viewport.width < 768), 'Mobile-only test');

      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      const buttons = page.getByRole('button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);

      const vw = viewport!.width;
      for (let i = 0; i < count; i++) {
        const box = await buttons.nth(i).boundingBox();
        if (box) {
          expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
        }
      }
    });
  });

  test.describe('learning dashboard with wallet', () => {
    test('renders curriculum dashboard without overflow', async ({ page, stellarAddress }) => {
      await mockWallet(page, stellarAddress);

      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      await expect(
        page.getByRole('heading', { name: /Curriculum Progress Dashboard/i })
      ).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    });

    test('course selector and lesson controls reachable on mobile', async ({
      page,
      stellarAddress,
    }) => {
      const viewport = page.viewportSize();
      test.skip(!(viewport && viewport.width < 768), 'Mobile-only test');

      await mockWallet(page, stellarAddress);

      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      await expect(page.getByText('Blockchain Foundations').first()).toBeVisible();
      await expect(page.getByText('Take Lesson').first()).toBeVisible();
    });

    test('footer Prev/Next controls are reachable on mobile', async ({
      page,
      stellarAddress,
    }) => {
      const viewport = page.viewportSize();
      test.skip(!(viewport && viewport.width < 768), 'Mobile-only test');

      await mockWallet(page, stellarAddress);

      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('button', { name: /Prev/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Next/i })).toBeVisible();
    });
  });

  test.describe('login page wallet connection', () => {
    test('wallet connect card renders without overflow when connected', async ({
      page,
      installWalletMocks,
      stellarAddress,
    }) => {
      await installWalletMocks();
      await mockWallet(page, stellarAddress, 'Freighter');

      await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

      await expect(page.getByText(stellarAddress).first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    });
  });

  test.describe('error and loading states', () => {
    test('error boundary shows actionable message without internals on API failure', async ({
      page,
      stellarAddress,
    }) => {
      await mockWallet(page, stellarAddress);

      await page.goto('/courses', { waitUntil: 'domcontentloaded' });

      const errorAlert = page.getByRole('alert');
      const hasError = await errorAlert.isVisible().catch(() => false);

      if (hasError) {
        const text = await errorAlert.textContent();
        expect(text).not.toContain('at ');
        expect(text).not.toContain('node_modules');
        expect(text).not.toMatch(/\/\w+\/\w+\.\w+:\d+/);

        await expect(errorAlert.getByText('Try again').first()).toBeVisible();
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    });

    test('courses page loading skeleton renders without overflow', async ({
      page,
      stellarAddress,
    }) => {
      await mockWallet(page, stellarAddress);

      await page.goto('/courses', { waitUntil: 'domcontentloaded' });

      await page.waitForTimeout(500);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    });
  });
});

async function mockWallet(
  page: any,
  address: string,
  wallet: string = 'Dev Mock Wallet'
) {
  await page.addInitScript(
    (params: { walletName: string; walletAddress: string }) => {
      window.localStorage.setItem(
        'stellar_wallet',
        JSON.stringify({ wallet: params.walletName, pk: params.walletAddress })
      );
    },
    { walletName: wallet, walletAddress: address }
  );
}
