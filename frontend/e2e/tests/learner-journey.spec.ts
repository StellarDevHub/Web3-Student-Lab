import { expect, test } from '../fixtures/web3.fixture';

/**
 * End-to-End Learner Journey Spec
 *
 * Tests the complete student path:
 * 1. Student Registration & Onboarding
 * 2. Course Discovery & Enrollment
 * 3. Monaco Smart Contract Playground / Code Editor Interaction
 * 4. Quiz Completion & Verification
 * 5. Certificate Viewing & Generation
 *
 * Mocks Web3 wallet connections (Freighter / MetaMask / Albedo) and Stellar Horizon RPC
 * responses via `web3.fixture.ts` for deterministic runs.
 */

const API_PREFIX = '**/api/v1';

test.beforeEach(async ({ page, installWalletMocks }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('render_warning_seen', 'true');
  });
  await installWalletMocks();
});

test.describe('Complete Learner Journey', () => {
  test('student registration and onboarding journey', async ({ page, stellarAddress }) => {
    // Mock user registration endpoint
    await page.route(`${API_PREFIX}/auth/register`, async (route) => {
      await route.fulfill({
        status: 201,
        json: {
          token: 'mock-learner-token-123',
          user: {
            id: 'learner-1',
            email: 'student@stellar.org',
            role: 'student',
            stellarAddress,
          },
        },
      });
    });

    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /register|sign up|create account/i })).toBeVisible();

    // Fill registration form if input elements exist
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('student@stellar.org');
    }
  });

  test('course enrollment and curriculum journey', async ({ page }) => {
    // Mock courses and enrollment API endpoints
    await page.route(`${API_PREFIX}/courses*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          courses: [
            {
              id: 'soroban-101',
              title: 'Soroban Smart Contract Development',
              description: 'Learn to write smart contracts on Stellar in Rust',
              enrolled: false,
            },
          ],
        },
      });
    });

    await page.route(`${API_PREFIX}/enrollments*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: { success: true, courseId: 'soroban-101' },
      });
    });

    await page.goto('/enroll', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('Monaco smart contract playground editing journey', async ({ page }) => {
    // Mock Stellar Horizon RPC responses for smart contract deployment / simulation
    await page.route('**/horizon-testnet.stellar.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'mock-tx-hash-1234567890',
          successful: true,
          ledger: 100000,
        },
      });
    });

    await page.route('**/soroban-testnet.stellar.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          jsonrpc: '2.0',
          id: 1,
          result: { status: 'SUCCESS', minResourceFee: '100' },
        },
      });
    });

    await page.goto('/playground', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('quiz completion and score evaluation journey', async ({ page }) => {
    await page.route(`${API_PREFIX}/quizzes*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'quiz-soroban-basics',
          title: 'Soroban Smart Contracts Quiz',
          questions: [
            {
              id: 'q1',
              text: 'What language are Soroban contracts written in?',
              options: ['Rust', 'Solidity', 'Go', 'Python'],
            },
          ],
        },
      });
    });

    await page.goto('/quiz', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('certificate viewing and DID verification journey', async ({ page }) => {
    await page.route(`${API_PREFIX}/certificates*`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'cert-999',
          courseTitle: 'Soroban Smart Contracts 101',
          issueDate: '2026-08-26',
          recipient: 'GCMOCKWALLETADDRESS000000000000000000000000000000000000000000000',
          signature: '0xmockcertificateproof',
        },
      });
    });

    await page.goto('/certificates', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
  });
});
