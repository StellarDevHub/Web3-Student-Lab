export type StellarNetwork = 'testnet' | 'mainnet';

const HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

export async function getAccountBalance(publicKey: string, network: StellarNetwork) {
  const response = await fetch(`${HORIZON_URLS[network]}/accounts/${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Unable to check ${network} balance (${response.status})`);
  }

  const account = (await response.json()) as { balances?: Array<{ asset_type: string; balance: string }> };
  const nativeBalance = account.balances?.find((balance) => balance.asset_type === 'native');
  return Number(nativeBalance?.balance ?? 0);
}

export async function fundTestnetAccount(publicKey: string) {
  const response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot could not fund this account (${response.status})`);
  }
}

export async function waitForTestnetFunding(publicKey: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const balance = await getAccountBalance(publicKey, 'testnet');
    if (balance !== null && balance >= 2) return balance;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Funding was requested, but the testnet balance did not update in time.');
}


export async function detectWalletNetwork(walletName: string): Promise<StellarNetwork | null> {
  if (walletName === 'Albedo' || walletName === 'Rabet') return 'testnet';
  if (typeof window === 'undefined') return null;

  const browserWindow = window as Window & {
    freighterApi?: { getNetworkDetails?: () => Promise<{ networkPassphrase?: string }> };
    freighter?: { getNetworkDetails?: () => Promise<{ networkPassphrase?: string }> };
    stellar?: { freighter?: { getNetworkDetails?: () => Promise<{ networkPassphrase?: string }> } };
  };
  const freighter = browserWindow.freighterApi || browserWindow.freighter || browserWindow.stellar?.freighter;
  if (!freighter?.getNetworkDetails) return null;

  const details = await freighter.getNetworkDetails();
  if (details.networkPassphrase === 'Public Global Stellar Network ; September 2015') return 'mainnet';
  if (details.networkPassphrase === 'Test SDF Network ; September 2015') return 'testnet';
  return null;
}
