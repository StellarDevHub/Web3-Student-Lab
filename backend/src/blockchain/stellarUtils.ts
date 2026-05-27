import { Horizon, Keypair, StrKey } from '@stellar/stellar-sdk';
import { HORIZON_URL } from '../config/rpcConfig.js';

export interface GeneratedKeypair {
  publicKey: string;
  secretKey: string;
}

export interface AccountInfo {
  exists: boolean;
  publicKey: string;
  balances: { asset: string; balance: string }[];
}

/**
 * Generates a new random Stellar keypair.
 * The secret key must be stored securely — it is only returned once.
 */
export function generateKeypair(): GeneratedKeypair {
  const keypair = Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

/**
 * Derives a keypair from an existing secret key.
 * Throws if the secret key is invalid.
 */
export function keypairFromSecret(secretKey: string): GeneratedKeypair {
  const keypair = Keypair.fromSecret(secretKey);
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

/**
 * Returns true if the given string is a valid Stellar public key (G...).
 */
export function isValidPublicKey(publicKey: string): boolean {
  return StrKey.isValidEd25519PublicKey(publicKey);
}

/**
 * Returns true if the given string is a valid Stellar secret key (S...).
 */
export function isValidSecretKey(secretKey: string): boolean {
  return StrKey.isValidEd25519SecretSeed(secretKey);
}

/**
 * Checks whether a Stellar account exists on the network and returns its balances.
 * Uses the configured Horizon server (testnet by default).
 */
export async function checkAccountExists(publicKey: string): Promise<AccountInfo> {
  if (!isValidPublicKey(publicKey)) {
    throw new Error(`Invalid Stellar public key: ${publicKey}`);
  }

  const server = new Horizon.Server(HORIZON_URL);

  try {
    const account = await server.loadAccount(publicKey);
    const balances = account.balances.map((b) => ({
      asset: b.asset_type === 'native' ? 'XLM' : 'asset_code' in b ? b.asset_code : b.asset_type,
      balance: b.balance,
    }));

    return { exists: true, publicKey, balances };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'response' in error &&
      (error as { response: { status: number } }).response?.status === 404
    ) {
      return { exists: false, publicKey, balances: [] };
    }
    throw error;
  }
}
