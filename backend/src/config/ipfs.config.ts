/**
 * IPFS Pinning Cluster Configuration — Issue BE-064
 *
 * Configures the multi-provider IPFS pinning cluster (Pinata, Infura, and
 * internal Kubo cluster node) with parallel dispatch, CID consistency checks,
 * and SHA-256 content integrity verification.
 *
 * Environment variables:
 *   PINATA_JWT                        Pinata JWT bearer token
 *   PINATA_PIN_ENDPOINT               default https://api.pinata.cloud/pinning/pinFileToIPFS
 *   INFURA_IPFS_PROJECT_ID            Infura IPFS project ID
 *   INFURA_IPFS_PROJECT_SECRET        Infura IPFS project secret
 *   INFURA_IPFS_ENDPOINT              default https://ipfs.infura.io:5001/api/v0/add
 *   KUBO_API_URL                      Internal Kubo node endpoint (default http://127.0.0.1:5001/api/v0/add)
 *   KUBO_API_USER                     Optional Kubo basic-auth username
 *   KUBO_API_PASSWORD                 Optional Kubo basic-auth password
 *   IPFS_CLUSTER_MIN_PROVIDERS        Minimum providers that must succeed (default 1)
 *   IPFS_CLUSTER_VERIFY_INTEGRITY     Whether to verify SHA-256 via gateway read-back (default false)
 *   IPFS_CLUSTER_TIMEOUT_MS           Per-provider upload timeout in ms (default 20000)
 *   IPFS_CLUSTER_CB_FAILURE_THRESHOLD Circuit breaker consecutive failure threshold (default 3)
 *   IPFS_CLUSTER_CB_COOLDOWN_MS       Circuit breaker cooldown in ms (default 30000)
 */

import type { CircuitBreakerOptions, PinProviderConfig } from '../services/ipfs.gateway.service.js';

export interface IpfsClusterConfig {
  /** Pinning providers dispatched in parallel (Pinata, Infura, internal Kubo). */
  providers: PinProviderConfig[];
  /** Minimum number of providers that must succeed for a pin to be accepted. Default 1. */
  minSuccessfulProviders: number;
  /** Enforce that all successful providers return the exact same CID. Default true. */
  verifyCidConsistency: boolean;
  /** Verify uploaded content via gateway read-back SHA-256 check before returning. Default false. */
  verifyContentIntegrity: boolean;
  /** Circuit breaker settings for pinning providers. */
  circuitBreaker: Required<CircuitBreakerOptions>;
}

function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Loads the multi-provider IPFS pinning cluster configuration from environment
 * variables. Pinata and Infura are included when their credentials are present;
 * the internal Kubo cluster node is always included as a local/internal peer.
 */
export function loadIpfsClusterConfig(env: NodeJS.ProcessEnv = process.env): IpfsClusterConfig {
  const timeoutMs = positiveIntFromEnv(env.IPFS_CLUSTER_TIMEOUT_MS, 20_000);
  const providers: PinProviderConfig[] = [];

  if (env.PINATA_JWT) {
    providers.push({
      name: 'Pinata',
      type: 'pinata',
      endpoint: env.PINATA_PIN_ENDPOINT ?? 'https://api.pinata.cloud/pinning/pinFileToIPFS',
      authToken: env.PINATA_JWT,
      timeoutMs,
      enabled: true,
    });
  }

  if (env.INFURA_IPFS_PROJECT_ID && env.INFURA_IPFS_PROJECT_SECRET) {
    providers.push({
      name: 'Infura',
      type: 'infura',
      endpoint: env.INFURA_IPFS_ENDPOINT ?? 'https://ipfs.infura.io:5001/api/v0/add',
      authToken: env.INFURA_IPFS_PROJECT_ID,
      authSecret: env.INFURA_IPFS_PROJECT_SECRET,
      timeoutMs,
      enabled: true,
    });
  }

  providers.push({
    name: 'Kubo-Local',
    type: 'kubo',
    endpoint: env.KUBO_API_URL ?? 'http://127.0.0.1:5001/api/v0/add',
    ...(env.KUBO_API_USER
      ? { authToken: env.KUBO_API_USER, authSecret: env.KUBO_API_PASSWORD ?? '' }
      : {}),
    timeoutMs: Math.min(timeoutMs, 15_000),
    enabled: true,
  });

  return {
    providers,
    minSuccessfulProviders: positiveIntFromEnv(env.IPFS_CLUSTER_MIN_PROVIDERS, 1),
    verifyCidConsistency: env.IPFS_CLUSTER_VERIFY_CID_CONSISTENCY !== 'false',
    verifyContentIntegrity: env.IPFS_CLUSTER_VERIFY_INTEGRITY === 'true',
    circuitBreaker: {
      failureThreshold: positiveIntFromEnv(env.IPFS_CLUSTER_CB_FAILURE_THRESHOLD, 3),
      cooldownMs: positiveIntFromEnv(env.IPFS_CLUSTER_CB_COOLDOWN_MS, 30_000),
    },
  };
}

export const ipfsClusterConfig: IpfsClusterConfig = loadIpfsClusterConfig();
