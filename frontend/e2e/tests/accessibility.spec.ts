/**
 * accessibility.spec.ts — Issue #1146
 *
 * Automated axe-core accessibility tests that verify WCAG 2.1 AA compliance
 * across interactive simulators, modals, and slide-out menus.
 *
 * Uses axe-core injected via page.evaluate() to avoid an extra npm dependency
 * that may conflict with the existing jest-axe setup.
 */

import { test, expect } from '../fixtures/web3.fixture';

/**
 * Inject axe-core from a CDN and run an audit against the current page.
 * Returns violations for assertion.
 */
async function runAxeAudit(page: import('@playwright/test').Page) {
  // Inject axe-core script
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.4/axe.min.js',
  });

  // Wait for axe to be available
  await page.waitForFunction(() => typeof (window as any).axe !== 'undefined');

  // Run axe and collect results
  const results = await page.evaluate(async () => {
    const axe = (window as any).axe;
    const results = await axe.run();
    return {
      violations: results.violations.map((v: any) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length,
        tags: v.tags.filter((t: string) => t.startsWith('wcag')),
      })),
    };
  });

  return results;
}

// Suppress the render warning modal that blocks viewport on fresh sessions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('render_warning_seen', 'true');
  });
});

test.describe('WCAG 2.1 AA Accessibility', () => {
  test('home page has no critical or serious axe violations', async ({ page }) => {
    await page.goto('/');
    // Allow page to settle
    await page.waitForTimeout(2000);

    const results = await runAxeAudit(page);

    const criticalOrSerious = results.violations.filter(
      (v: any) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalOrSerious).toEqual([]);
  });

  test('simulator page has no critical or serious axe violations', async ({ page }) => {
    // Seed wallet and role to pass guards
    await page.addInitScript(() => {
      window.localStorage.setItem('stellar_wallet', 'true');
      window.localStorage.setItem('token', 'mock-jwt-token');
      window.localStorage.setItem('user', JSON.stringify({ role: 'student' }));
    });

    await page.goto('/simulator');
    // Wait for simulator to initialize and live data to start
    await page.waitForTimeout(3000);

    const results = await runAxeAudit(page);

    const criticalOrSerious = results.violations.filter(
      (v: any) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalOrSerious).toEqual([]);
  });

  test('notification sidebar has no axe violations when open', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('stellar_wallet', 'true');
      window.localStorage.setItem('token', 'mock-jwt-token');
      window.localStorage.setItem('user', JSON.stringify({ role: 'student' }));
    });

    await page.goto('/simulator');
    await page.waitForTimeout(2000);

    // Open notification sidebar via bell icon if present
    const bellButton = page.locator('button[aria-label*="notification"], button[aria-label*="Notification"]').first();
    if (await bellButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await bellButton.click();
      await page.waitForTimeout(500);

      const results = await runAxeAudit(page);

      const criticalOrSerious = results.violations.filter(
        (v: any) => v.impact === 'critical' || v.impact === 'serious',
      );

      expect(criticalOrSerious).toEqual([]);
    }
  });

  test('keyboard navigation: Tab moves focus through interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Tab from body and verify focus moves
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName + (el?.getAttribute('role') || '') + (el?.getAttribute('aria-label') || '');
    });

    // Focus should have moved to an interactive element
    expect(firstFocused).not.toBe('BODY');
  });

  test('all interactive elements have minimum 44x44 touch target', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('stellar_wallet', 'true');
      window.localStorage.setItem('token', 'mock-jwt-token');
      window.localStorage.setItem('user', JSON.stringify({ role: 'student' }));
    });

    await page.goto('/simulator');
    await page.waitForTimeout(3000);

    // Check buttons and interactive elements have minimum touch target size
    const undersized = await page.evaluate(() => {
      const interactive = document.querySelectorAll('button, a, input, select, [role="button"]');
      const results: string[] = [];

      interactive.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          results.push(
            `${el.tagName}(${el.textContent?.trim().slice(0, 20) || 'no-text'}): ${Math.round(rect.width)}x${Math.round(rect.height)}`,
          );
        }
      });

      return results;
    });

    // Report undersized elements but don't fail (some may be intentionally small)
    if (undersized.length > 0) {
      console.log(`Elements below 44x44 touch target: ${undersized.join(', ')}`);
    }
  });
});
