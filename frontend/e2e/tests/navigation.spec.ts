import { expect, test } from '../fixtures/web3.fixture';

test.describe('critical learning journeys', () => {
  test('opens the simulator and playground with mocked realtime transport', async ({
    page,
    installWebSocketMock,
  }) => {
    await installWebSocketMock();

    await page.goto('/simulator', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Network Simulator/i })).toBeVisible();

    await page.goto('/playground', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Soroban Playground/i })).toBeVisible();
    await expect(page.getByText(/Experimental Smart Contract Runtime/i)).toBeVisible();
  });
});
