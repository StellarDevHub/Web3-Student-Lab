/**
 * SecurityService
 *
 * Manages two complementary encryption layers:
 *
 * 1. RSA-OAEP (in-memory, ephemeral)
 *    Rotating 4096-bit RSA key-pairs used so that clients can encrypt short
 *    payloads for transit without sharing a symmetric secret up front.
 *    Keys live only in memory and are regenerated on every rotation cycle
 *    (default: every 24 hours, expiry: 48 hours to allow overlap).
 *
 * 2. AES-256-GCM (symmetric, versioned, persistent)
 *    Long-lived keys loaded from PAYLOAD_ENCRYPTION_KEY_v<N> environment
 *    variables via EncryptionKeyManager.  Used to encrypt sensitive fields
 *    stored at rest in the database.  Ciphertexts embed their key version so
 *    old records can be decrypted and re-encrypted during key rotation without
 *    downtime.
 *
 * Key rotation workflow (symmetric layer)
 * ────────────────────────────────────────
 *  1. Add PAYLOAD_ENCRYPTION_KEY_v<N+1> to the environment / secrets manager.
 *  2. Deploy — new encryptions immediately use v<N+1>.
 *  3. POST /api/v1/security/rotate-payloads (admin-only) re-encrypts existing
 *     rows in configurable batches.
 *  4. Confirm migration via GET /api/v1/security/key-versions.
 *  5. Remove the old key variable in the next deploy once all rows are migrated.
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';
import {
    getEncryptionKeyManager,
    type EncryptionKeyManager,
    type KeyVersionInfo,
    type RotationResult,
} from './encryptionKeyManager.js';

// ---------------------------------------------------------------------------
// RSA key-pair types (ephemeral layer)
// ---------------------------------------------------------------------------

interface RsaKeyPair {
  publicKey: string;
  privateKey: string;
  createdAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// SecurityService
// ---------------------------------------------------------------------------

export class SecurityService {
  // ── RSA (transit) ─────────────────────────────────────────────────────
  private keyMap: Map<string, RsaKeyPair> = new Map();
  private currentKeyId: string | null = null;
  private readonly RSA_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h
  private readonly RSA_KEY_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 h

  // ── AES-GCM (at-rest) — delegated to EncryptionKeyManager ─────────────
  private readonly ekm: EncryptionKeyManager;

  constructor(ekm?: EncryptionKeyManager) {
    // Allow injection for tests; fall back to the application singleton.
    this.ekm = ekm ?? getEncryptionKeyManager();

    this.rotateRsaKeys();
    setInterval(() => this.rotateRsaKeys(), this.RSA_ROTATION_INTERVAL_MS);
  }

  // =========================================================================
  // RSA transit-encryption API (unchanged public contract)
  // =========================================================================

  /**
   * Generate a new RSA-4096 key-pair, store it, and retire expired pairs.
   * Called automatically every RSA_ROTATION_INTERVAL_MS.
   */
  public async rotateKeys(): Promise<void> {
    return this.rotateRsaKeys();
  }

  private async rotateRsaKeys(): Promise<void> {
    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const keyId = crypto.randomUUID();
      const now = Date.now();

      this.keyMap.set(keyId, {
        publicKey,
        privateKey,
        createdAt: now,
        expiresAt: now + this.RSA_KEY_EXPIRY_MS,
      });

      this.currentKeyId = keyId;
      logger.info('SecurityService: RSA key rotated', { keyId });

      this.cleanupExpiredRsaKeys();
    } catch (error) {
      logger.error('SecurityService: RSA key rotation failed', { error });
    }
  }

  private cleanupExpiredRsaKeys(): void {
    const now = Date.now();
    for (const [keyId, kp] of this.keyMap.entries()) {
      if (kp.expiresAt < now) {
        this.keyMap.delete(keyId);
        logger.info('SecurityService: expired RSA key removed', { keyId });
      }
    }
  }

  /**
   * Return the current RSA public key and its identifier.
   * Clients use this to encrypt short payloads before sending them to the API.
   */
  public getPublicKey(): { keyId: string; publicKey: string } | null {
    if (!this.currentKeyId) return null;
    const kp = this.keyMap.get(this.currentKeyId);
    if (!kp) return null;
    return { keyId: this.currentKeyId, publicKey: kp.publicKey };
  }

  /**
   * Decrypt an RSA-OAEP ciphertext that was encrypted with the public key
   * identified by `keyId`.
   *
   * @throws if `keyId` is unknown / expired or decryption fails.
   */
  public decrypt(keyId: string, encryptedData: string): unknown {
    const kp = this.keyMap.get(keyId);
    if (!kp) {
      throw new Error('Invalid or expired RSA key ID');
    }

    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt(
        {
          key: kp.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer
      );

      const result: unknown = JSON.parse(decrypted.toString());

      // Wipe plaintext buffer from heap as much as possible
      decrypted.fill(0);

      return result;
    } catch (error) {
      // Do not leak internal error details to callers
      logger.error('SecurityService: RSA decryption failed', { error });
      throw new Error('Decryption failed');
    }
  }

  // =========================================================================
  // AES-256-GCM at-rest encryption API (new, delegated to EncryptionKeyManager)
  // =========================================================================

  /**
   * Encrypt `plaintext` under the current active symmetric key.
   * Returns an opaque envelope string that is safe to persist in any text column.
   */
  public encryptField(plaintext: string): string {
    return this.ekm.encrypt(plaintext);
  }

  /**
   * Decrypt an AES-GCM envelope string.
   * Automatically resolves the correct key from the version embedded in the
   * envelope, so old ciphertexts continue to work during key migration.
   */
  public decryptField(envelopeStr: string): string {
    return this.ekm.decrypt(envelopeStr);
  }

  // =========================================================================
  // Key-rotation introspection & migration helpers
  // =========================================================================

  /**
   * Return public metadata for all loaded symmetric key versions.
   * Key material is never included.
   */
  public listSymmetricKeyVersions(): KeyVersionInfo[] {
    return this.ekm.listKeyVersions();
  }

  /**
   * Return the version number of the currently active symmetric key.
   */
  public getActiveSymmetricKeyVersion(): number {
    return this.ekm.getActiveVersion();
  }

  /**
   * Re-encrypt a single AES-GCM envelope under the active key.
   * Returns a `RotationResult` — the caller decides whether to persist the
   * new envelope.  Safe to call with an already-current envelope (no-op).
   */
  public rotateEnvelope(envelopeStr: string): RotationResult {
    return this.ekm.rotateEnvelope(envelopeStr);
  }

  /**
   * Re-encrypt a batch of envelopes.  Individual failures are isolated and
   * returned as `{ id, error }` entries so one corrupt row does not abort the
   * whole batch.
   */
  public rotateBatch(
    items: Array<{ id: string; envelopeStr: string }>
  ): Array<{ id: string } & ({ result: RotationResult } | { error: string })> {
    return this.ekm.rotateBatch(items);
  }

  /**
   * Reload symmetric keys from environment variables without restarting.
   * Useful when a secrets manager injects new key variables at runtime.
   */
  public reloadSymmetricKeys(): void {
    this.ekm.reload();
    logger.info(
      'SecurityService: symmetric keys reloaded',
      { activeVersion: this.ekm.getActiveVersion() }
    );
  }
}

// ---------------------------------------------------------------------------
// Application singleton
// ---------------------------------------------------------------------------

export const securityService = new SecurityService();
