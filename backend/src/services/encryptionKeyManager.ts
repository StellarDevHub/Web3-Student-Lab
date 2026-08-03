/**
 * EncryptionKeyManager
 *
 * Loads versioned AES-256-GCM keys from environment variables, tracks the
 * active (highest-version) key, and exposes encrypt / decrypt / rotate helpers.
 *
 * Environment variable convention
 * ─────────────────────────────────
 *   PAYLOAD_ENCRYPTION_KEY_v1=<64 hex chars>   ← oldest retained key
 *   PAYLOAD_ENCRYPTION_KEY_v2=<64 hex chars>
 *   PAYLOAD_ENCRYPTION_KEY_v3=<64 hex chars>   ← active key (highest version)
 *
 * Rules
 * ─────
 *  • At least one key must be present; startup fails otherwise.
 *  • The key with the highest version number is "active" (used for new encryptions).
 *  • Old-version keys are kept so that ciphertexts encrypted under them can still
 *    be decrypted during migration.
 *  • Re-encryption re-encrypts a ciphertext under the active key without ever
 *    persisting the plaintext — the caller receives the new envelope and decides
 *    where to store it.
 *
 * Key rotation workflow
 * ─────────────────────
 *  1. Generate a new 32-byte key:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *  2. Add PAYLOAD_ENCRYPTION_KEY_v<N+1> to environment / secrets manager.
 *  3. Deploy — new payloads are immediately encrypted under v<N+1>.
 *  4. Call POST /api/v1/security/rotate-payloads (admin-only) to migrate existing rows.
 *  5. After migration is confirmed, remove the old key variable in the next deploy.
 */

import logger from '../utils/logger.js';
import {
  validateKeyMaterial,
  encryptPayload,
  decryptPayload,
  decodeEnvelope,
  reEncryptPayload,
} from '../utils/encryption.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyEntry {
  version: number;
  /** 32-byte AES-256 key material — never exposed outside this module */
  keyBuffer: Buffer;
  loadedAt: Date;
}

export interface KeyVersionInfo {
  version: number;
  loadedAt: string;
  isActive: boolean;
}

export interface RotationResult {
  /** New envelope string to persist */
  newEnvelope: string;
  /** Version the payload was re-encrypted FROM */
  previousVersion: number;
  /** Version the payload was re-encrypted TO */
  currentVersion: number;
  /** Whether any work was done (false when already on active version) */
  migrated: boolean;
}

// ---------------------------------------------------------------------------
// Key loading
// ---------------------------------------------------------------------------

const KEY_ENV_PATTERN = /^PAYLOAD_ENCRYPTION_KEY_v(\d+)$/;

/**
 * Scan `process.env` for all `PAYLOAD_ENCRYPTION_KEY_v<N>` variables and
 * return them as validated KeyEntry objects sorted ascending by version.
 */
function loadKeysFromEnv(): KeyEntry[] {
  const entries: KeyEntry[] = [];

  for (const [name, value] of Object.entries(process.env)) {
    const match = KEY_ENV_PATTERN.exec(name);
    if (!match || !value) continue;

    const version = parseInt(match[1], 10);

    try {
      const keyBuffer = validateKeyMaterial(value);
      entries.push({ version, keyBuffer, loadedAt: new Date() });
    } catch (err) {
      // Surface a clear startup error — a bad key is not recoverable
      throw new Error(
        `Invalid key material in ${name}: ${(err as Error).message}`
      );
    }
  }

  if (entries.length === 0) {
    throw new Error(
      'No PAYLOAD_ENCRYPTION_KEY_v<N> variables found. ' +
        'Set at least PAYLOAD_ENCRYPTION_KEY_v1 to a 64-char hex string.'
    );
  }

  return entries.sort((a, b) => a.version - b.version);
}

// ---------------------------------------------------------------------------
// EncryptionKeyManager class
// ---------------------------------------------------------------------------

export class EncryptionKeyManager {
  private keys: Map<number, KeyEntry> = new Map();
  private activeVersion: number = 0;

  constructor() {
    this.reload();
  }

  // ── Initialisation ──────────────────────────────────────────────────────

  /**
   * (Re)load keys from environment variables.
   * Safe to call at runtime after adding a new key variable without a restart
   * (e.g. when using a secrets manager that injects into `process.env`).
   */
  public reload(): void {
    const entries = loadKeysFromEnv();

    this.keys.clear();
    for (const entry of entries) {
      this.keys.set(entry.version, entry);
    }

    // Active key = highest version
    this.activeVersion = entries[entries.length - 1].version;

    logger.info(
      {
        keyVersions: entries.map((e) => e.version),
        activeVersion: this.activeVersion,
      },
      'EncryptionKeyManager: keys loaded'
    );
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  public getActiveVersion(): number {
    return this.activeVersion;
  }

  public hasVersion(version: number): boolean {
    return this.keys.has(version);
  }

  /**
   * Return public metadata for all loaded key versions (no key material).
   */
  public listKeyVersions(): KeyVersionInfo[] {
    return Array.from(this.keys.values()).map((entry) => ({
      version: entry.version,
      loadedAt: entry.loadedAt.toISOString(),
      isActive: entry.version === this.activeVersion,
    }));
  }

  // ── Encrypt / Decrypt ───────────────────────────────────────────────────

  /**
   * Encrypt `plaintext` under the currently active key.
   * Returns an opaque envelope string safe to store in any text field.
   */
  public encrypt(plaintext: string): string {
    const entry = this.getActiveEntry();
    return encryptPayload(plaintext, entry.keyBuffer, entry.version);
  }

  /**
   * Decrypt an envelope string.
   * Automatically selects the key version embedded in the envelope so old
   * ciphertexts continue to decrypt during migration.
   */
  public decrypt(envelopeStr: string): string {
    const envelope = decodeEnvelope(envelopeStr);
    const entry = this.keys.get(envelope.v);

    if (!entry) {
      throw new Error(
        `Cannot decrypt: key version ${envelope.v} is not loaded. ` +
          `Ensure PAYLOAD_ENCRYPTION_KEY_v${envelope.v} is set.`
      );
    }

    return decryptPayload(envelopeStr, entry.keyBuffer);
  }

  // ── Rotation ─────────────────────────────────────────────────────────────

  /**
   * Re-encrypt `envelopeStr` under the active key if it is not already on
   * that version.  Returns a `RotationResult` so the caller can decide
   * whether to persist the new envelope and emit operational signals.
   *
   * Guarantees:
   *  • The original envelope is never modified.
   *  • If decryption or re-encryption fails the error is thrown — no partial
   *    or corrupted data is ever returned.
   *  • If the envelope is already on the active version, `migrated` is false
   *    and `newEnvelope` equals the input — no DB write is needed.
   */
  public rotateEnvelope(envelopeStr: string): RotationResult {
    const envelope = decodeEnvelope(envelopeStr);

    if (envelope.v === this.activeVersion) {
      return {
        newEnvelope: envelopeStr,
        previousVersion: envelope.v,
        currentVersion: this.activeVersion,
        migrated: false,
      };
    }

    const oldEntry = this.keys.get(envelope.v);
    if (!oldEntry) {
      throw new Error(
        `Cannot rotate: source key version ${envelope.v} is not loaded`
      );
    }

    const newEntry = this.getActiveEntry();

    const { newEnvelope, previousVersion } = reEncryptPayload(
      envelopeStr,
      oldEntry.keyBuffer,
      newEntry.keyBuffer,
      newEntry.version
    );

    return {
      newEnvelope,
      previousVersion,
      currentVersion: newEntry.version,
      migrated: true,
    };
  }

  /**
   * Convenience: rotate a batch of envelopes in one call.
   * Returns per-item results.  Individual failures are caught and returned as
   * `{ error }` entries so one bad row does not abort the batch.
   */
  public rotateBatch(
    envelopes: Array<{ id: string; envelopeStr: string }>
  ): Array<{ id: string } & ({ result: RotationResult } | { error: string })> {
    return envelopes.map(({ id, envelopeStr }) => {
      try {
        return { id, result: this.rotateEnvelope(envelopeStr) };
      } catch (err) {
        logger.warn({ id }, 'EncryptionKeyManager.rotateBatch: item failed');
        return { id, error: (err as Error).message };
      }
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private getActiveEntry(): KeyEntry {
    const entry = this.keys.get(this.activeVersion);
    if (!entry) {
      // Should never happen because reload() validates this
      throw new Error('EncryptionKeyManager: active key entry missing — call reload()');
    }
    return entry;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Application-wide singleton.
 *
 * Initialisation is deferred: the instance is created lazily on first access
 * so that tests can set environment variables before the manager reads them.
 */
let _instance: EncryptionKeyManager | null = null;

export function getEncryptionKeyManager(): EncryptionKeyManager {
  if (!_instance) {
    _instance = new EncryptionKeyManager();
  }
  return _instance;
}

/**
 * Replace the singleton — used by tests to inject a fresh manager with
 * controlled key material without touching global `process.env`.
 */
export function setEncryptionKeyManager(manager: EncryptionKeyManager): void {
  _instance = manager;
}

/**
 * Reset the singleton (clears the cached instance).
 * Useful in tests and when a full re-initialisation from env is desired.
 */
export function resetEncryptionKeyManager(): void {
  _instance = null;
}
