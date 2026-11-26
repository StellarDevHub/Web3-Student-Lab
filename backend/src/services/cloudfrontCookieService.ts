import crypto from 'crypto';
import logger from '../utils/logger.js';

export interface CloudFrontSignedCookies {
  'CloudFront-Key-Pair-Id': string;
  'CloudFront-Policy': string;
  'CloudFront-Signature': string;
}

export interface GenerateCookiesOptions {
  resourceUrl: string;
  expiresInSeconds?: number;
  keyPairId?: string;
  privateKey?: string;
}

export interface VerifyCookiesOptions {
  cookies: Record<string, string>;
  requestUrl: string;
  publicKey?: string;
}

export interface CookieVerificationResult {
  valid: boolean;
  reason?: 'missing_cookies' | 'expired' | 'resource_mismatch' | 'invalid_signature' | 'malformed_policy';
  policy?: Record<string, unknown>;
}

// In-memory fallback keypair for development/testing when AWS credentials are not configured in environment
let inMemoryKeyPair: { privateKey: string; publicKey: string; keyPairId: string } | null = null;

export function getOrCreateDefaultKeyPair(): { privateKey: string; publicKey: string; keyPairId: string } {
  if (inMemoryKeyPair) {
    return inMemoryKeyPair;
  }

  const envPrivateKey = process.env.CLOUDFRONT_PRIVATE_KEY;
  const envPublicKey = process.env.CLOUDFRONT_PUBLIC_KEY;
  const envKeyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID || 'K2JC3XQEXAMPLE';

  if (envPrivateKey && envPublicKey) {
    inMemoryKeyPair = {
      privateKey: envPrivateKey,
      publicKey: envPublicKey,
      keyPairId: envKeyPairId,
    };
    return inMemoryKeyPair;
  }

  // Generate ephemeral RSA 2048 keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  inMemoryKeyPair = {
    privateKey,
    publicKey,
    keyPairId: envKeyPairId,
  };

  return inMemoryKeyPair;
}

export function setCustomKeyPair(keyPair: { privateKey: string; publicKey: string; keyPairId: string } | null): void {
  inMemoryKeyPair = keyPair;
}

/**
 * Standard CloudFront URL-safe base64 encoding (RFC 4648 / AWS CloudFront spec):
 * replace '+' with '-', '=' with '_', '/' with '~'
 */
export function toCloudFrontSafeBase64(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/=/g, '_')
    .replace(/\//g, '~');
}

/**
 * Decodes CloudFront URL-safe base64 back to raw Buffer
 */
export function fromCloudFrontSafeBase64(input: string): Buffer {
  const stdBase64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '=')
    .replace(/~/g, '/');
  return Buffer.from(stdBase64, 'base64');
}

/**
 * Creates minified custom CloudFront policy JSON
 */
export function createCustomPolicy(resourceUrl: string, epochExpirySeconds: number): string {
  const policy = {
    Statement: [
      {
        Resource: resourceUrl,
        Condition: {
          DateLessThan: {
            'AWS:EpochTime': epochExpirySeconds,
          },
        },
      },
    ],
  };
  return JSON.stringify(policy);
}

/**
 * Generates AWS CloudFront signed cookies validated for a resource pattern
 */
export function generateCloudFrontSignedCookies(options: GenerateCookiesOptions): CloudFrontSignedCookies {
  const defaultKeys = getOrCreateDefaultKeyPair();
  const keyPairId = options.keyPairId || defaultKeys.keyPairId;
  const privateKey = options.privateKey || defaultKeys.privateKey;
  const expiresInSeconds = options.expiresInSeconds || 24 * 60 * 60; // 24h default
  const epochExpiry = Math.floor(Date.now() / 1000) + expiresInSeconds;

  const policyJson = createCustomPolicy(options.resourceUrl, epochExpiry);
  const encodedPolicy = toCloudFrontSafeBase64(policyJson);

  // Sign policy with RSA-SHA1 per CloudFront spec
  const signer = crypto.createSign('RSA-SHA1');
  signer.update(policyJson);
  const signatureBuffer = signer.sign(privateKey);
  const encodedSignature = toCloudFrontSafeBase64(signatureBuffer);

  return {
    'CloudFront-Key-Pair-Id': keyPairId,
    'CloudFront-Policy': encodedPolicy,
    'CloudFront-Signature': encodedSignature,
  };
}

/**
 * Helper to match CloudFront wildcard resource patterns (e.g. *\/videos\/123\/*)
 */
export function matchResourcePattern(pattern: string, url: string): boolean {
  if (pattern === '*' || pattern === url) {
    return true;
  }
  // Escape regex specials except '*'
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(url) || url.includes(pattern.replace(/\*/g, ''));
}

/**
 * Verifies CloudFront signed cookies against the requested URL and expiration
 */
export function verifyCloudFrontSignedCookies(options: VerifyCookiesOptions): CookieVerificationResult {
  const { cookies, requestUrl } = options;
  const keyPairId = cookies['CloudFront-Key-Pair-Id'];
  const encodedPolicy = cookies['CloudFront-Policy'];
  const encodedSignature = cookies['CloudFront-Signature'];

  if (!keyPairId || !encodedPolicy || !encodedSignature) {
    return { valid: false, reason: 'missing_cookies' };
  }

  let policyJson: string;
  let parsedPolicy: any;

  try {
    const policyBuf = fromCloudFrontSafeBase64(encodedPolicy);
    policyJson = policyBuf.toString('utf8');
    parsedPolicy = JSON.parse(policyJson);
  } catch (err) {
    logger.warn('[CloudFrontCookies] Failed to decode policy JSON', { error: String(err) });
    return { valid: false, reason: 'malformed_policy' };
  }

  const statement = parsedPolicy?.Statement?.[0];
  const resourcePattern = statement?.Resource;
  const epochExpires = statement?.Condition?.DateLessThan?.['AWS:EpochTime'];

  if (!resourcePattern || typeof epochExpires !== 'number') {
    return { valid: false, reason: 'malformed_policy' };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (now >= epochExpires) {
    return { valid: false, reason: 'expired', policy: parsedPolicy };
  }

  // Check resource matching
  if (!matchResourcePattern(resourcePattern, requestUrl)) {
    return { valid: false, reason: 'resource_mismatch', policy: parsedPolicy };
  }

  // Verify signature
  const defaultKeys = getOrCreateDefaultKeyPair();
  const publicKey = options.publicKey || defaultKeys.publicKey;

  try {
    const signatureBuf = fromCloudFrontSafeBase64(encodedSignature);
    const verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(policyJson);
    const isSignatureValid = verifier.verify(publicKey, signatureBuf);

    if (!isSignatureValid) {
      return { valid: false, reason: 'invalid_signature', policy: parsedPolicy };
    }

    return { valid: true, policy: parsedPolicy };
  } catch (err) {
    logger.error('[CloudFrontCookies] Error during signature verification', { error: String(err) });
    return { valid: false, reason: 'invalid_signature' };
  }
}

/**
 * Robustly parses cookies from Request headers or cookies object
 */
export function parseCookiesFromRequest(
  cookieHeader?: string,
  reqCookies?: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = { ...(reqCookies || {}) };

  if (cookieHeader) {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        if (key && !result[key]) {
          try {
            result[key] = decodeURIComponent(val);
          } catch {
            result[key] = val;
          }
        }
      }
    }
  }

  return result;
}
