import { expect, test } from '../fixtures/web3.fixture';

test.describe('wallet onboarding', () => {
  test('installs mocked Stellar and Ethereum wallet providers', async ({
    page,
    installWalletMocks,
    stellarAddress,
    ethereumAddress,
  }) => {
    await installWalletMocks();
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    const walletState = await page.evaluate(async () => {
      const freighter = (window as any).freighterApi;
      const ethereum = (window as any).ethereum;

      return {
        stellarAddress: freighter ? (await freighter.requestAccess?.())?.address : null,
        ethereumAddress: ethereum ? (await ethereum.request({ method: 'eth_requestAccounts' }))?.[0] : null,
      };
    });

    expect(walletState.stellarAddress).toBe(stellarAddress);
    expect(walletState.ethereumAddress).toBe(ethereumAddress);
    await expect(page.getByRole('button', { name: /Freighter/ })).toContainText('Ready to connect');
  });

  test('restores wallet state into the transaction state chart', async ({
    page,
    stellarAddress,
  }) => {
    await page.addInitScript(
      ({ address }) => {
        window.localStorage.setItem(
          'stellar_wallet',
          JSON.stringify({ wallet: 'Freighter', pk: address })
        );
      },
      { address: stellarAddress }
    );

    await page.goto('/devtools/wallet', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(`CONNECTED — Freighter`)).toBeVisible();
    await expect(page.getByText(stellarAddress).first()).toBeVisible();
    await expect(page.getByLabel('Web3 transaction lifecycle state chart')).toContainText('connected');
  });

  test('keeps unavailable Freighter detection controlled', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Freighter/ })).toContainText(
      'Click to detect extension'
    );
  });
});
