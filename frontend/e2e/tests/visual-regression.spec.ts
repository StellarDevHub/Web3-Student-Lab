import { expect, test } from '../fixtures/web3.fixture';

const routes = [
  '/',
  '/dashboard',
  '/auth/login',
  '/auth/register',
  '/courses',
  '/roadmap',
  '/enroll',
  '/quiz',
  '/peer-review',
  '/snippets',
  '/video',
  '/bookmarks',
  '/simulator',
  '/simulator/scanner',
  '/simulator/crypto',
  '/simulator/explorer',
  '/playground',
  '/playground/triage',
  '/mempool-auction',
  '/chain-reorg',
  '/merkle-tree',
  '/stellar-consensus-protocol',
  '/yield-calculator',
  '/asset-management',
  '/airdrop',
  '/crowdfunding',
  '/notarization',
  '/subscriptions',
  '/certificates',
  '/verify',
  '/version-control',
  '/blog',
  '/forum',
  '/ideas',
  '/hackathon-ideas',
  '/analytics',
  '/performance-metrics',
  '/resource-estimator',
  '/devtools',
  '/admin'
];

const themes = ['light', 'dark', 'oled'] as const;

test.describe('visual regression tests', () => {
  for (const route of routes) {
    for (const theme of themes) {
      test(`Visual snapshot of ${route} in theme: ${theme}`, async ({
        page,
        installWalletMocks,
        installWebSocketMock,
      }) => {
        // Setup wallet mocks and websocket mocks to ensure offline-first behavior
        await installWalletMocks();
        await installWebSocketMock();

        // Inject theme settings into local storage before navigation
        await page.addInitScript((t) => {
          window.localStorage.setItem('web3-lab-theme', t);
          const prefs = JSON.parse(window.localStorage.getItem('web3_student_lab_preferences') || '{}');
          prefs.theme = t;
          window.localStorage.setItem('web3_student_lab_preferences', JSON.stringify(prefs));
        }, theme);

        // Navigate to the target route
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        
        // Wait briefly for layout settlement
        await page.waitForTimeout(300);

        // Perform visual screenshot verification with 0.2% diff pixel threshold
        await expect(page).toHaveScreenshot({
          mask: [
            page.locator('canvas'),
            page.locator('time'),
            page.locator('.animate-pulse'),
            page.locator('.font-mono:has-text("0x")'), // Mask Ethereum hashes/addresses
            page.locator('.font-mono:has-text("G")'),  // Mask Stellar keys
          ],
          maxDiffPixelRatio: 0.002, // strict 0.2% threshold
          animations: 'disabled',   // disable CSS transitions & animations
        });
      });
    }
  }
});
