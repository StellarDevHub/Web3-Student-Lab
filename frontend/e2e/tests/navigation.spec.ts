import { expect, test } from '../fixtures/web3.fixture';

test.describe('critical learning journeys', () => {
  test('opens the simulator and playground with mocked realtime transport', async ({
    page,
    installWebSocketMock,
    stellarAddress,
  }) => {
    await installWebSocketMock();

    await page.addInitScript(
      (address) => {
        window.localStorage.setItem(
          'stellar_wallet',
          JSON.stringify({ wallet: 'Dev Mock Wallet', pk: address })
        );
      },
      { address: stellarAddress }
    );

    await page.goto('/simulator', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Network Simulator/i })).toBeVisible();

    await page.goto('/playground', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Soroban Playground/i })).toBeVisible();
    await expect(page.getByText(/Experimental Smart Contract Runtime/i)).toBeVisible();
  });
});
