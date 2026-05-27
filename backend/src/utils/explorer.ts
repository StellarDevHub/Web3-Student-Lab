import { getEnvVar } from './checkEnv.js';

/**
 * Supported Stellar networks
 */
export type StellarNetwork = 'mainnet' | 'testnet' | 'public';

/**
 * Generates a link to the Stellar.expert explorer for a given transaction hash.
 *
 * @param txHash The transaction hash to look up
 * @param network The Stellar network (defaults to STELLAR_NETWORK env var)
 * @returns The full URL to the transaction on Stellar.expert
 */
export function getExplorerLink(
  txHash: string,
  network: StellarNetwork = getEnvVar('STELLAR_NETWORK', 'testnet') as StellarNetwork
): string {
  // Normalize network name for stellar.expert
  // stellar.expert uses 'public' for mainnet and 'testnet' for testnet
  const networkParam = network === 'mainnet' || network === 'public' ? 'public' : 'testnet';

  return `https://stellar.expert/explorer/${networkParam}/tx/${txHash}`;
}

/**
 * Generates a link to the Stellar.expert explorer for a given account public key.
 *
 * @param publicKey The account public key to look up
 * @param network The Stellar network (defaults to STELLAR_NETWORK env var)
 * @returns The full URL to the account on Stellar.expert
 */
export function getAccountExplorerLink(
  publicKey: string,
  network: StellarNetwork = getEnvVar('STELLAR_NETWORK', 'testnet') as StellarNetwork
): string {
  const networkParam = network === 'mainnet' || network === 'public' ? 'public' : 'testnet';

  return `https://stellar.expert/explorer/${networkParam}/account/${publicKey}`;
}
