import crypto from 'crypto';

export const canonicalizeJson = (value: unknown): string => {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortValue);
    }

    if (input && typeof input === 'object') {
      return Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sortValue((input as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }

    return input;
  };

  return JSON.stringify(sortValue(value));
};

export const buildGatewayUrl = (cid: string): string => {
  const baseUrl = (process.env.STORAGE_GATEWAY_BASE_URL || 'https://gateway.pinata.cloud/ipfs').replace(
    /\/+$/,
    ''
  );

  return `${baseUrl}/${cid}`;
};

export const buildIpfsUri = (cid: string): string => `ipfs://${cid}`;

export const createDeterministicCid = (input: string): string => {
  return `bafy${crypto.createHash('sha256').update(input).digest('hex').slice(0, 56)}`;
};

/**
 * SHA-256 digest of `input`, hex-encoded. Used for post-upload content
 * integrity verification (#912) — not a CID: computing a real IPFS CID
 * would require replicating the exact UnixFS/DAG-PB wrapping a provider
 * like Pinata applies before hashing, which needs a full multiformats
 * implementation this codebase doesn't currently depend on. A direct
 * digest comparison of "what we sent" vs. "what the provider will serve
 * back" catches the same class of problem (corrupted transfer, provider
 * bug, tampering) without needing to reimplement IPFS's addressing scheme.
 */
export const sha256Hex = (input: string | Buffer): string => {
  return crypto.createHash('sha256').update(input).digest('hex');
};

