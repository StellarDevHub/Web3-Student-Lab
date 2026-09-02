import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npm run start -- -H 0.0.0.0 -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Build the app to call the API on the same origin the E2E tests run
      // against. NEXT_PUBLIC_API_URL otherwise defaults to a *different*
      // origin (localhost:8080), which turns every mocked API call in the
      // e2e suite into a cross-origin request — page.route() still
      // intercepts it, but the browser enforces CORS on the mocked
      // response too, so requests silently fail unless the mock also fakes
      // CORS headers. Same-origin sidesteps that entirely and keeps the
      // suite free of any real backend/CORS dependency.
      NEXT_PUBLIC_API_URL: `${baseURL}/api/v1`,
      NEXT_PUBLIC_WS_URL: `ws://localhost:${port}`,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
