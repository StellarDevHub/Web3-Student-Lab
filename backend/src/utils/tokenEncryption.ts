import crypto from 'crypto';
import logger from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key

interface EncryptedToken {
  /** Base64-encoded encrypted token data */
  encrypted: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  authTag: string;
  /** Key identifier for rotation tracking */
  keyId: string;
}

/**
 * Get the active encryption key from environment.
 * Supports key rotation via comma-separated TOKEN_ENCRYPTION_KEYS.
 * The FIRST key is the active key for new encryptions.
 * All keys are used for decryption (rotation support).
 */
function getEncryptionKeys(): Map<string, Buffer> {
  const keysEnv = process.env.TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEYS || '';
  const keyStrings = keysEnv.split(',').map(k => k.trim()).filter(Boolean);

  if (keyStrings.length === 0) {
    // Generate a fallback key for development (NOT for production!)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY environment variable is required in production. ' +
        'Generate with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
      );
    }
    const fallbackKey = crypto.randomBytes(KEY_LENGTH).toString('hex');
    logger.warn('TOKEN_ENCRYPTION_KEY not set. Using ephemeral key (tokens will be lost on restart).');
    keyStrings.push(fallbackKey);
  }

  const keyMap = new Map<string, Buffer>();
  for (const keyStr of keyStrings) {
    if (!keyStr) continue;
    // Accept hex or base64 encoded keys
    const keyBuffer: Buffer = keyStr.length === 64
      ? Buffer.from(keyStr, 'hex')
      : Buffer.from(keyStr, 'base64');

    if (keyBuffer.length < KEY_LENGTH) {
      throw new Error(`Encryption key is too short. Need at least ${KEY_LENGTH} bytes.`);
    }

    // Derive a key ID from the key material (first 8 bytes of SHA-256)
    const keyId = crypto.createHash('sha256').update(keyBuffer).digest('hex').substring(0, 16);
    keyMap.set(keyId, keyBuffer.subarray(0, KEY_LENGTH));
  }
  return keyMap;
}

let _keyCache: Map<string, Buffer> | null = null;
let _activeKeyId: string | null = null;

function getKeyCache(): Map<string, Buffer> {
  if (!_keyCache) {
    _keyCache = getEncryptionKeys();
    _activeKeyId = _keyCache.keys().next().value || null;
    logger.info(`Token encryption initialized with ${_keyCache.size} key(s). Active key: ${_activeKeyId?.substring(0, 8)}...`);
  }
  return _keyCache;
}

function getActiveKeyId(): string {
  getKeyCache(); // ensure initialized
  if (!_activeKeyId) {
    throw new Error('No encryption keys available');
  }
  return _activeKeyId;
}

/**
 * Encrypt a plaintext token using AES-256-GCM.
 * Returns a JSON string with all components needed for decryption.
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty token');
  }

  const keys = getKeyCache();
  const keyId = getActiveKeyId();
  const key = keys.get(keyId);
  if (!key) {
    throw new Error(`Active encryption key ${keyId} not found`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const result: EncryptedToken = {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId,
  };

  return JSON.stringify(result);
}

/**
 * Decrypt a token that was encrypted with encryptToken.
 * Supports key rotation: tries all available keys.
 */
export function decryptToken(encryptedPayload: string): string {
  if (!encryptedPayload) {
    throw new Error('Cannot decrypt empty payload');
  }

  let tokenData: EncryptedToken;
  try {
    tokenData = JSON.parse(encryptedPayload) as EncryptedToken;
  } catch {
    // If it's not valid JSON, it might be a legacy plaintext token
    return encryptedPayload;
  }

  if (!tokenData.encrypted || !tokenData.iv || !tokenData.authTag || !tokenData.keyId) {
    throw new Error('Invalid encrypted token format');
  }

  const keys = getKeyCache();

  // Try the specific key first, then fall back to all keys (rotation support)
  const keysToTry = keys.has(tokenData.keyId)
    ? [tokenData.keyId, ...Array.from(keys.keys()).filter(k => k !== tokenData.keyId)]
    : Array.from(keys.keys());

  for (const keyId of keysToTry) {
    const key = keys.get(keyId);
    if (!key) continue;

    try {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(tokenData.iv, 'base64'),
        { authTagLength: AUTH_TAG_LENGTH }
      );
      decipher.setAuthTag(Buffer.from(tokenData.authTag, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(tokenData.encrypted, 'base64')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      // Wrong key, try next one
      continue;
    }
  }

  throw new Error('Failed to decrypt token with any available key');
}

/**
 * Check if a stored token value is encrypted (JSON wrapper) or legacy plaintext.
 */
export function isTokenEncrypted(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return !!(parsed.encrypted && parsed.iv && parsed.authTag && parsed.keyId);
  } catch {
    return false;
  }
}

/**
 * Re-encrypt a token with the current active key (for key rotation).
 * Returns the same token if it's already encrypted with the active key.
 */
export function reEncryptToken(encryptedPayload: string): string {
  if (!encryptedPayload) return encryptedPayload;

  // Check if already using the active key
  try {
    const tokenData = JSON.parse(encryptedPayload) as EncryptedToken;
    if (tokenData.keyId === getActiveKeyId()) {
      return encryptedPayload; // Already current
    }
  } catch {
    // Legacy plaintext, will be encrypted below
  }

  const plaintext = decryptToken(encryptedPayload);
  return encryptToken(plaintext);
}

/**
 * Wipe key cache (for testing). Resets encryption state.
 */
export function resetEncryptionKeys(): void {
  _keyCache = null;
  _activeKeyId = null;
}
