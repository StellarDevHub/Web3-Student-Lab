import dotenv from 'dotenv';

// dotenv.config(); // Skip in Docker Compose - use environment variables instead

const RPC_DEFAULTS: Record<string, string> = {
  local: 'http://localhost:8000/soroban/rpc',
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

const HORIZON_DEFAULTS: Record<string, string> = {
  local: 'http://localhost:8000',
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

/**
 * The active Stellar network. Defaults to "testnet" for local development.
 * Override with the STELLAR_NETWORK environment variable.
 */
export const STELLAR_NETWORK: string = process.env.STELLAR_NETWORK ?? 'testnet';

/**
 * Soroban RPC URL for the active network.
 * Override with the SOROBAN_RPC_URL environment variable.
 */
export const SOROBAN_RPC_URL: string =
  process.env.SOROBAN_RPC_URL ?? RPC_DEFAULTS[STELLAR_NETWORK] ?? RPC_DEFAULTS['testnet']!;

/**
 * Horizon API URL for the active network.
 * Override with the HORIZON_URL environment variable.
 */
export const HORIZON_URL: string =
  process.env.HORIZON_URL ?? HORIZON_DEFAULTS[STELLAR_NETWORK] ?? HORIZON_DEFAULTS['testnet']!;

/**
 * Certificate NFT Contract ID on Soroban
 */
export const CERTIFICATE_CONTRACT_ID: string = process.env.CERTIFICATE_CONTRACT_ID ?? '';

/**
 * Base API URL for the backend (used in metadata URIs)
 */
export const API_BASE_URL: string = process.env.API_BASE_URL ?? 'http://localhost:8080';

/**
 * Base URL for certificate metadata (off-chain JSON)
 */
export const CERT_METADATA_BASE_URL: string = process.env.CERT_METADATA_BASE_URL ?? API_BASE_URL;

/**
 * Base URL for certificate image generation
 */
export const CERT_IMAGE_BASE_PATH: string = process.env.CERT_IMAGE_BASE_PATH ?? '';

/**
 * Public verification URL (shown in QR codes)
 */
export const VERIFICATION_URL: string =
  process.env.VERIFICATION_URL ?? `${API_BASE_URL}/api/v1/certificates/verify`;

/**
 * Issuer DID for certificate verification
 */
export const ISSUER_DID: string =
  process.env.ISSUER_DID ?? 'did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT';

/**
 * Issuer name shown on certificates
 */
export const ISSUER_NAME: string = process.env.ISSUER_NAME ?? 'Web3 Student Lab';
