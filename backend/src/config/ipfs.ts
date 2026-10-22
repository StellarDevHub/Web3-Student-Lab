/**
 * IPFS / Filecoin pinning configuration — Issue BE-011
 *
 * Environment variables:
 *   PINATA_JWT                    Pinata JWT (hot IPFS pinning, primary)
 *   PINATA_PIN_ENDPOINT           default https://api.pinata.cloud/pinning/pinFileToIPFS
 *   KUBO_API_URL                  secondary IPFS pinning node (default http://127.0.0.1:5001/api/v0/add)
 *   WEB3STORAGE_TOKEN             Web3.Storage token (Filecoin persistent storage deals)
 *   WEB3STORAGE_UPLOAD_ENDPOINT   default https://api.web3.storage/upload
 *   IPFS_CDN_BASE_URL             Cloudflare-fronted gateway serving active assets
 *                                 (default https://cloudflare-ipfs.com)
 *   IPFS_SECONDARY_GATEWAYS       comma-separated fallback gateway base URLs
 *   IPFS_PIN_MAX_ATTEMPTS         per-provider attempts before falling back (default 3)
 *   IPFS_PIN_BASE_DELAY_MS        first backoff delay (default 150)
 *   IPFS_PIN_MAX_DELAY_MS         backoff ceiling (default 2000)
 *   IPFS_PIN_ATTEMPT_TIMEOUT_MS   per-request timeout (default 2500)
 *   IPFS_CERTIFICATE_PIN_SLA_MS   certificate auto-pin deadline (default 3000)
 */

export type PinningProviderType = 'pinata' | 'kubo' | 'web3storage';

export interface PinningProviderConfig {
  name: string;
  type: PinningProviderType;
  endpoint: string;
  /** Bearer token (Pinata / Web3.Storage) or basic-auth user (Kubo). */
  authToken?: string;
  /** Basic-auth password (Kubo behind a proxy). */
  authSecret?: string;
  /**
   * `hot`      — IPFS pinning used for low-latency retrieval (ordered fallback chain).
   * `filecoin` — persistent storage with Filecoin deals (pinned in parallel).
   */
  role: 'hot' | 'filecoin';
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  attemptTimeoutMs: number;
}

export interface IpfsConfig {
  providers: PinningProviderConfig[];
  /** CDN gateway base URL (Cloudflare) — first gateway tried and the public URL returned. */
  cdnBaseUrl: string;
  /** Fallback gateway base URLs used when the CDN gateway is unreachable. */
  secondaryGateways: string[];
  retry: RetryPolicy;
  /** Deadline for pinning a freshly issued certificate. */
  certificatePinSlaMs: number;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadIpfsConfig(env: NodeJS.ProcessEnv = process.env): IpfsConfig {
  const providers: PinningProviderConfig[] = [];

  if (env.PINATA_JWT) {
    providers.push({
      name: 'Pinata',
      type: 'pinata',
      endpoint: env.PINATA_PIN_ENDPOINT ?? 'https://api.pinata.cloud/pinning/pinFileToIPFS',
      authToken: env.PINATA_JWT,
      role: 'hot',
    });
  }

  providers.push({
    name: 'Kubo',
    type: 'kubo',
    endpoint: env.KUBO_API_URL ?? 'http://127.0.0.1:5001/api/v0/add',
    ...(env.KUBO_API_USER ? { authToken: env.KUBO_API_USER, authSecret: env.KUBO_API_PASSWORD ?? '' } : {}),
    role: 'hot',
  });

  if (env.WEB3STORAGE_TOKEN) {
    providers.push({
      name: 'Web3.Storage',
      type: 'web3storage',
      endpoint: env.WEB3STORAGE_UPLOAD_ENDPOINT ?? 'https://api.web3.storage/upload',
      authToken: env.WEB3STORAGE_TOKEN,
      role: 'filecoin',
    });
  }

  const secondaryGateways = (env.IPFS_SECONDARY_GATEWAYS ?? 'https://gateway.pinata.cloud,https://w3s.link,https://ipfs.io')
    .split(',')
    .map((url) => trimTrailingSlash(url.trim()))
    .filter(Boolean);

  return {
    providers,
    cdnBaseUrl: trimTrailingSlash(env.IPFS_CDN_BASE_URL ?? 'https://cloudflare-ipfs.com'),
    secondaryGateways,
    retry: {
      maxAttempts: numberFromEnv(env.IPFS_PIN_MAX_ATTEMPTS, 3),
      baseDelayMs: numberFromEnv(env.IPFS_PIN_BASE_DELAY_MS, 150),
      maxDelayMs: numberFromEnv(env.IPFS_PIN_MAX_DELAY_MS, 2_000),
      attemptTimeoutMs: numberFromEnv(env.IPFS_PIN_ATTEMPT_TIMEOUT_MS, 2_500),
    },
    certificatePinSlaMs: numberFromEnv(env.IPFS_CERTIFICATE_PIN_SLA_MS, 3_000),
  };
}

export const ipfsConfig = loadIpfsConfig();
