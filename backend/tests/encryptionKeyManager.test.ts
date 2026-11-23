/**
 * Unit tests for backend/src/services/encryptionKeyManager.ts
 *
 * Covers:
 *  - Key loading from env vars (single key, multiple versions, bad material)
 *  - Active version selection (highest wins)
 *  - encrypt → decrypt round-trip
 *  - Decrypt with old key version (backwards compatibility)
 *  - rotateEnvelope: already current (no-op), migrates old → new version
 *  - rotateBatch: mixed success / failure in one call
 *  - reload() picks up new keys added to process.env at runtime
 *  - Missing keys → clean startup error
 *  - setEncryptionKeyManager / resetEncryptionKeyManager test helpers
 */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import {
  EncryptionKeyManager,
  resetEncryptionKeyManager,
  setEncryptionKeyManager,
  getEncryptionKeyManager,
} from '../src/services/encryptionKeyManager.js';
import { decodeEnvelope } from '../src/utils/encryption.js';

// ---------------------------------------------------------------------------
// Test key fixtures (32 bytes each, deterministic for reproducibility)
// ---------------------------------------------------------------------------

const KEY_V1_HEX = '0000000000000000000000000000000000000000000000000000000000000001';
const KEY_V2_HEX = '0000000000000000000000000000000000000000000000000000000000000002';
const KEY_V3_HEX = '0000000000000000000000000000000000000000000000000000000000000003';
// A key that is NOT 32 bytes (30 bytes → 60 hex chars)
const BAD_KEY_HEX = crypto.randomBytes(30).toString('hex');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalEnv = process.env;

/** Set only the payload encryption keys for a test */
function withKeys(versions: Record<number, string>): void {
  // Remove any existing key vars first
  for (const k of Object.keys(process.env)) {
    if (/^PAYLOAD_ENCRYPTION_KEY_v\d+$/.test(k)) delete process.env[k];
  }
  for (const [v, hex] of Object.entries(versions)) {
    process.env[`PAYLOAD_ENCRYPTION_KEY_v${v}`] = hex;
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env = { ...originalEnv };
  resetEncryptionKeyManager();
});

afterEach(() => {
  process.env = originalEnv;
  resetEncryptionKeyManager();
});

// ---------------------------------------------------------------------------
// Key loading
// ---------------------------------------------------------------------------

describe('EncryptionKeyManager — key loading', () => {
  it('loads a single key version and sets it as active', () => {
    withKeys({ 1: KEY_V1_HEX });
    const mgr = new EncryptionKeyManager();
    expect(mgr.getActiveVersion()).toBe(1);
    expect(mgr.hasVersion(1)).toBe(true);
  });

  it('selects the highest version as active when multiple versions are present', () => {
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX, 3: KEY_V3_HEX });
    const mgr = new EncryptionKeyManager();
    expect(mgr.getActiveVersion()).toBe(3);
    expect(mgr.hasVersion(1)).toBe(true);
    expect(mgr.hasVersion(2)).toBe(true);
    expect(mgr.hasVersion(3)).toBe(true);
  });

  it('throws on startup when no PAYLOAD_ENCRYPTION_KEY_v<N> variables are set', () => {
    withKeys({});
    expect(() => new EncryptionKeyManager()).toThrow(/No PAYLOAD_ENCRYPTION_KEY/);
  });

  it('throws on startup when a key has invalid length', () => {
    process.env['PAYLOAD_ENCRYPTION_KEY_v1'] = BAD_KEY_HEX;
    expect(() => new EncryptionKeyManager()).toThrow(/Invalid key material/);
  });

  it('throws on startup when a key is an empty string', () => {
    process.env['PAYLOAD_ENCRYPTION_KEY_v1'] = '';
    // Empty string is skipped by the loader (falsy guard), so no keys → error
    expect(() => new EncryptionKeyManager()).toThrow(/No PAYLOAD_ENCRYPTION_KEY/);
  });
});

// ---------------------------------------------------------------------------
// listKeyVersions
// ---------------------------------------------------------------------------

describe('EncryptionKeyManager.listKeyVersions', () => {
  it('returns metadata without key material', () => {
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();
    const versions = mgr.listKeyVersions();

    expect(versions).toHaveLength(2);

    const active = versions.find((v) => v.isActive);
    expect(active?.version).toBe(2);

    const inactive = versions.find((v) => !v.isActive);
    expect(inactive?.version).toBe(1);

    // No key material leaked
    for (const v of versions) {
      const asAny = v as Record<string, unknown>;
      expect(asAny['keyBuffer']).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// encrypt / decrypt round-trip
// ---------------------------------------------------------------------------

describe('EncryptionKeyManager.encrypt / decrypt', () => {
  it('encrypts under the active version and decrypts back to plaintext', () => {
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();

    const plaintext = 'github_access_token_abc123';
    const envelope = mgr.encrypt(plaintext);

    expect(mgr.decrypt(envelope)).toBe(plaintext);
    // Envelope carries version 2 (the active one)
    expect(decodeEnvelope(envelope).v).toBe(2);
  });

  it('decrypts a v1 ciphertext when both v1 and v2 keys are loaded (backward compat)', () => {
    // Encrypt with only v1 loaded
    withKeys({ 1: KEY_V1_HEX });
    const mgrV1 = new EncryptionKeyManager();
    const v1Envelope = mgrV1.encrypt('old secret');

    // Now load v1 + v2 (active = v2)
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const mgrV2 = new EncryptionKeyManager();

    // Must still decrypt the v1 envelope
    expect(mgrV2.decrypt(v1Envelope)).toBe('old secret');
  });

  it('throws when decrypting an envelope whose key version is not loaded', () => {
    withKeys({ 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();

    // Build an envelope that claims version 1
    withKeys({ 1: KEY_V1_HEX });
    const v1Mgr = new EncryptionKeyManager();
    const v1Envelope = v1Mgr.encrypt('data');

    // mgr only has v2 — should throw
    expect(() => mgr.decrypt(v1Envelope)).toThrow(/key version 1 is not loaded/);
  });
});

// ---------------------------------------------------------------------------
// rotateEnvelope
// ---------------------------------------------------------------------------

describe('EncryptionKeyManager.rotateEnvelope', () => {
  it('returns migrated=false when the envelope is already on the active version', () => {
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();

    const envelope = mgr.encrypt('data');          // encrypted under v2
    const result = mgr.rotateEnvelope(envelope);

    expect(result.migrated).toBe(false);
    expect(result.currentVersion).toBe(2);
    expect(result.previousVersion).toBe(2);
    expect(result.newEnvelope).toBe(envelope);
  });

  it('re-encrypts a v1 envelope to v2 and sets migrated=true', () => {
    withKeys({ 1: KEY_V1_HEX });
    const v1Mgr = new EncryptionKeyManager();
    const v1Envelope = v1Mgr.encrypt('secret value');

    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();

    const result = mgr.rotateEnvelope(v1Envelope);

    expect(result.migrated).toBe(true);
    expect(result.previousVersion).toBe(1);
    expect(result.currentVersion).toBe(2);
    // New envelope decrypts correctly
    expect(mgr.decrypt(result.newEnvelope)).toBe('secret value');
    // New envelope carries version 2
    expect(decodeEnvelope(result.newEnvelope).v).toBe(2);
    // Original envelope is untouched
    expect(mgr.decrypt(v1Envelope)).toBe('secret value');
  });

  it('throws when the source key version is not loaded', () => {
    // Envelope encrypted under v1, but only v2 is available for rotation
    withKeys({ 1: KEY_V1_HEX });
    const v1Mgr = new EncryptionKeyManager();
    const v1Envelope = v1Mgr.encrypt('orphaned');

    withKeys({ 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();

    expect(() => mgr.rotateEnvelope(v1Envelope)).toThrow(/source key version 1 is not loaded/);
  });

  it('does not corrupt the original on failure', () => {
    withKeys({ 1: KEY_V1_HEX });
    const v1Mgr = new EncryptionKeyManager();
    const v1Envelope = v1Mgr.encrypt('important data');

    withKeys({ 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();

    try {
      mgr.rotateEnvelope(v1Envelope);
    } catch {
      // expected — but the original v1 envelope must still be intact
    }

    // Reload v1 and confirm original is readable
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const fullMgr = new EncryptionKeyManager();
    expect(fullMgr.decrypt(v1Envelope)).toBe('important data');
  });
});

// ---------------------------------------------------------------------------
// rotateBatch — mixed versions
// ---------------------------------------------------------------------------

describe('EncryptionKeyManager.rotateBatch', () => {
  it('migrates v1 items and skips already-current v2 items', () => {
    // Create v1 envelopes
    withKeys({ 1: KEY_V1_HEX });
    const v1Mgr = new EncryptionKeyManager();
    const v1a = v1Mgr.encrypt('value-a');
    const v1b = v1Mgr.encrypt('value-b');

    // Now manager has v1 + v2 active
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();
    const v2c = mgr.encrypt('value-c');  // already on active version

    const results = mgr.rotateBatch([
      { id: 'row-a', envelopeStr: v1a },
      { id: 'row-b', envelopeStr: v1b },
      { id: 'row-c', envelopeStr: v2c },
    ]);

    expect(results).toHaveLength(3);

    const rowA = results.find((r) => r.id === 'row-a')!;
    const rowB = results.find((r) => r.id === 'row-b')!;
    const rowC = results.find((r) => r.id === 'row-c')!;

    expect('result' in rowA && rowA.result.migrated).toBe(true);
    expect('result' in rowB && rowB.result.migrated).toBe(true);
    expect('result' in rowC && rowC.result.migrated).toBe(false);
  });

  it('isolates failures — one bad row does not abort others', () => {
    withKeys({ 1: KEY_V1_HEX, 2: KEY_V2_HEX });
    const mgr = new EncryptionKeyManager();

    // Build a valid v2 envelope and a garbage string
    const goodEnvelope = mgr.encrypt('valid');
    const badEnvelope = 'this-is-not-a-valid-envelope';

    const results = mgr.rotateBatch([
      { id: 'good', envelopeStr: goodEnvelope },
      { id: 'bad', envelopeStr: badEnvelope },
    ]);

    expect(results).toHaveLength(2);

    const good = results.find((r) => r.id === 'good')!;
    const bad = results.find((r) => r.id === 'bad')!;

    expect('result' in good).toBe(true);
    expect('error' in bad).toBe(true);
    // Error message present but no plaintext exposed
    if ('error' in bad) {
      expect(typeof bad.error).toBe('string');
      expect(bad.error.length).toBeGreaterThan(0);
    }
  });

  it('handles an empty batch gracefully', () => {
    withKeys({ 1: KEY_V1_HEX });
    const mgr = new EncryptionKeyManager();
    expect(mgr.rotateBatch([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// reload()
// ---------------------------------------------------------------------------

describe('EncryptionKeyManager.reload', () => {
  it('picks up a new key version added to process.env after construction', () => {
    withKeys({ 1: KEY_V1_HEX });
    const mgr = new EncryptionKeyManager();
    expect(mgr.getActiveVersion()).toBe(1);

    // Simulate a secrets manager injecting a new key at runtime
    process.env['PAYLOAD_ENCRYPTION_KEY_v2'] = KEY_V2_HEX;
    mgr.reload();

    expect(mgr.getActiveVersion()).toBe(2);
    expect(mgr.hasVersion(1)).toBe(true);
    expect(mgr.hasVersion(2)).toBe(true);
  });

  it('throws on reload when no valid keys remain in env', () => {
    withKeys({ 1: KEY_V1_HEX });
    const mgr = new EncryptionKeyManager();

    // Remove all key vars
    withKeys({});
    expect(() => mgr.reload()).toThrow(/No PAYLOAD_ENCRYPTION_KEY/);
  });
});

// ---------------------------------------------------------------------------
// Singleton helpers
// ---------------------------------------------------------------------------

describe('singleton helpers', () => {
  it('getEncryptionKeyManager returns the same instance on repeated calls', () => {
    withKeys({ 1: KEY_V1_HEX });
    const a = getEncryptionKeyManager();
    const b = getEncryptionKeyManager();
    expect(a).toBe(b);
  });

  it('setEncryptionKeyManager replaces the singleton', () => {
    withKeys({ 1: KEY_V1_HEX });
    const original = getEncryptionKeyManager();

    withKeys({ 2: KEY_V2_HEX });
    const fresh = new EncryptionKeyManager();
    setEncryptionKeyManager(fresh);

    expect(getEncryptionKeyManager()).toBe(fresh);
    expect(getEncryptionKeyManager()).not.toBe(original);
  });

  it('resetEncryptionKeyManager clears the cached instance', () => {
    withKeys({ 1: KEY_V1_HEX });
    const first = getEncryptionKeyManager();
    resetEncryptionKeyManager();

    withKeys({ 1: KEY_V1_HEX });
    const second = getEncryptionKeyManager();
    expect(second).not.toBe(first);
  });
});
