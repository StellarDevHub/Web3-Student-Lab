/**
 * AES-256-GCM symmetric encryption utility.
 *
 * Envelope format (base64url-encoded JSON):
 * {
 *   "v":   <number>   key version
 *   "iv":  <hex>      12-byte initialisation vector
 *   "tag": <hex>      16-byte GCM authentication tag
 *   "ct":  <hex>      ciphertext
 * }
 *
 * The envelope is then base64url-encoded into a single opaque string that can
 * be stored in any text column.  The key version ("v") travels with the
 * ciphertext so the decryptor can look up the correct key during migration.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptedEnvelope {
  /** Key version that was active when this ciphertext was produced */
  v: number;
  /** 12-byte IV, hex-encoded */
  iv: string;
  /** 16-byte GCM authentication tag, hex-encoded */
  tag: string;
  /** Ciphertext, hex-encoded */
  ct: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm' as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Validate that the supplied Buffer (or hex string converted to Buffer) is
 * exactly 32 bytes long, as required by AES-256.
 */
export function validateKeyMaterial(keyHex: string): Buffer {
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `Invalid key material: expected ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars), ` +
        `got ${buf.length} bytes`
    );
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt `plaintext` with `keyBuffer` (32-byte AES-256 key).
 * Returns a base64url-encoded envelope string that embeds the key version.
 */
export function encryptPayload(
  plaintext: string,
  keyBuffer: Buffer,
  keyVersion: number
): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  const ctBuf = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    v: keyVersion,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ct: ctBuf.toString('hex'),
  };

  return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

/**
 * Decode an envelope string produced by `encryptPayload`.
 * Throws a descriptive error on malformed input — never returns partial data.
 */
export function decodeEnvelope(envelopeStr: string): EncryptedEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(envelopeStr, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid envelope: base64url decode or JSON parse failed');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).v !== 'number' ||
    typeof (parsed as Record<string, unknown>).iv !== 'string' ||
    typeof (parsed as Record<string, unknown>).tag !== 'string' ||
    typeof (parsed as Record<string, unknown>).ct !== 'string'
  ) {
    throw new Error('Invalid envelope: missing or wrong-typed fields (v, iv, tag, ct)');
  }

  return parsed as EncryptedEnvelope;
}

/**
 * Decrypt an envelope string using the supplied `keyBuffer`.
 * Returns the original plaintext string.
 * Throws on authentication failure or structural issues — never swallows errors silently.
 */
export function decryptPayload(envelopeStr: string, keyBuffer: Buffer): string {
  const envelope = decodeEnvelope(envelopeStr);

  let plaintext: string;
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      keyBuffer,
      Buffer.from(envelope.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));

    const ptBuf = Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, 'hex')),
      decipher.final(),
    ]);

    plaintext = ptBuf.toString('utf8');

    // Wipe plaintext buffer from heap as much as possible
    ptBuf.fill(0);
  } catch (cause) {
    // Do not expose internal crypto details
    const err = new Error('Decryption failed: authentication tag mismatch or corrupted data');
    (err as NodeJS.ErrnoException).cause = cause;
    throw err;
  }

  return plaintext;
}

/**
 * Re-encrypt an existing envelope under a new key.
 * Returns the new envelope string and the old key version for audit logging.
 *
 * The operation is atomic-by-value: the original envelope is not modified and
 * the new envelope is only returned on full success.  Callers are responsible
 * for persisting it.
 */
export function reEncryptPayload(
  envelopeStr: string,
  oldKeyBuffer: Buffer,
  newKeyBuffer: Buffer,
  newKeyVersion: number
): { newEnvelope: string; previousVersion: number } {
  const envelope = decodeEnvelope(envelopeStr);
  const plaintext = decryptPayload(envelopeStr, oldKeyBuffer);
  const newEnvelope = encryptPayload(plaintext, newKeyBuffer, newKeyVersion);
  return { newEnvelope, previousVersion: envelope.v };
}
