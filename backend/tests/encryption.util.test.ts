/**
 * Unit tests for backend/src/utils/encryption.ts
 *
 * Covers:
 *  - Round-trip encrypt → decrypt
 *  - Key version is embedded in envelope
 *  - Decoding an envelope returns correct structure
 *  - Re-encryption via reEncryptPayload
 *  - Failure paths: wrong key, tampered tag, malformed envelope, bad key material
 */

import { describe, expect, it } from '@jest/globals';
import crypto from 'crypto';
import {
  encryptPayload,
  decryptPayload,
  decodeEnvelope,
  reEncryptPayload,
  validateKeyMaterial,
} from '../src/utils/encryption.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a fresh 32-byte key buffer */
const makeKey = (): Buffer => crypto.randomBytes(32);

// ---------------------------------------------------------------------------
// validateKeyMaterial
// ---------------------------------------------------------------------------

describe('validateKeyMaterial', () => {
  it('accepts a valid 64-char hex string', () => {
    const hex = crypto.randomBytes(32).toString('hex');
    const buf = validateKeyMaterial(hex);
    expect(buf.length).toBe(32);
  });

  it('throws on a 31-byte (62-char hex) key', () => {
    const hex = crypto.randomBytes(31).toString('hex');
    expect(() => validateKeyMaterial(hex)).toThrow(/32 bytes/);
  });

  it('throws on a 33-byte (66-char hex) key', () => {
    const hex = crypto.randomBytes(33).toString('hex');
    expect(() => validateKeyMaterial(hex)).toThrow(/32 bytes/);
  });

  it('throws on an empty string', () => {
    expect(() => validateKeyMaterial('')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// encryptPayload / decryptPayload — round-trip
// ---------------------------------------------------------------------------

describe('encryptPayload / decryptPayload round-trip', () => {
  it('encrypts and decrypts a short string', () => {
    const key = makeKey();
    const plaintext = 'hello world';
    const envelope = encryptPayload(plaintext, key, 1);
    expect(decryptPayload(envelope, key)).toBe(plaintext);
  });

  it('encrypts and decrypts an empty string', () => {
    const key = makeKey();
    const envelope = encryptPayload('', key, 1);
    expect(decryptPayload(envelope, key)).toBe('');
  });

  it('encrypts and decrypts unicode / emoji content', () => {
    const key = makeKey();
    const plaintext = '🔑 секрет 秘密';
    const envelope = encryptPayload(plaintext, key, 2);
    expect(decryptPayload(envelope, key)).toBe(plaintext);
  });

  it('encrypts and decrypts a long payload (>1 KB)', () => {
    const key = makeKey();
    const plaintext = 'x'.repeat(2048);
    const envelope = encryptPayload(plaintext, key, 1);
    expect(decryptPayload(envelope, key)).toBe(plaintext);
  });

  it('produces different ciphertexts on each call (random IV)', () => {
    const key = makeKey();
    const plaintext = 'same plaintext';
    const e1 = encryptPayload(plaintext, key, 1);
    const e2 = encryptPayload(plaintext, key, 1);
    expect(e1).not.toBe(e2);
  });

  it('embeds the correct key version in the envelope', () => {
    const key = makeKey();
    const envelope = encryptPayload('data', key, 7);
    const decoded = decodeEnvelope(envelope);
    expect(decoded.v).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// decodeEnvelope
// ---------------------------------------------------------------------------

describe('decodeEnvelope', () => {
  it('returns correct fields from a valid envelope', () => {
    const key = makeKey();
    const envelope = encryptPayload('test', key, 3);
    const decoded = decodeEnvelope(envelope);

    expect(decoded.v).toBe(3);
    expect(typeof decoded.iv).toBe('string');
    expect(typeof decoded.tag).toBe('string');
    expect(typeof decoded.ct).toBe('string');
    // IV should be 12 bytes = 24 hex chars
    expect(decoded.iv.length).toBe(24);
    // Tag should be 16 bytes = 32 hex chars
    expect(decoded.tag.length).toBe(32);
  });

  it('throws on arbitrary base64url garbage', () => {
    expect(() => decodeEnvelope('not-valid-base64url!!')).toThrow();
  });

  it('throws on valid base64url that is not JSON', () => {
    const notJson = Buffer.from('hello world').toString('base64url');
    expect(() => decodeEnvelope(notJson)).toThrow(/JSON parse/);
  });

  it('throws on JSON missing required fields', () => {
    const incomplete = Buffer.from(JSON.stringify({ v: 1 })).toString('base64url');
    expect(() => decodeEnvelope(incomplete)).toThrow(/missing or wrong-typed/);
  });
});

// ---------------------------------------------------------------------------
// Failure paths
// ---------------------------------------------------------------------------

describe('decryptPayload failure paths', () => {
  it('throws when decrypting with the wrong key', () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const envelope = encryptPayload('secret', key1, 1);
    expect(() => decryptPayload(envelope, key2)).toThrow(/Decryption failed/);
  });

  it('throws when the authentication tag is tampered', () => {
    const key = makeKey();
    const envelope = encryptPayload('secret', key, 1);
    const decoded = decodeEnvelope(envelope);

    // Flip the first byte of the tag
    const tamperedTag =
      ((parseInt(decoded.tag.slice(0, 2), 16) ^ 0xff) >>> 0).toString(16).padStart(2, '0') +
      decoded.tag.slice(2);

    const tampered = Buffer.from(
      JSON.stringify({ ...decoded, tag: tamperedTag })
    ).toString('base64url');

    expect(() => decryptPayload(tampered, key)).toThrow(/Decryption failed/);
  });

  it('throws when the ciphertext is truncated', () => {
    const key = makeKey();
    const envelope = encryptPayload('secret data', key, 1);
    const decoded = decodeEnvelope(envelope);
    const truncatedCt = decoded.ct.slice(0, Math.max(0, decoded.ct.length - 4));

    const tampered = Buffer.from(
      JSON.stringify({ ...decoded, ct: truncatedCt })
    ).toString('base64url');

    expect(() => decryptPayload(tampered, key)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// reEncryptPayload
// ---------------------------------------------------------------------------

describe('reEncryptPayload', () => {
  it('re-encrypts under a new key and new version', () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const plaintext = 'sensitive payload';

    const oldEnvelope = encryptPayload(plaintext, key1, 1);
    const { newEnvelope, previousVersion } = reEncryptPayload(oldEnvelope, key1, key2, 2);

    expect(previousVersion).toBe(1);
    // New envelope decrypts correctly with key2
    expect(decryptPayload(newEnvelope, key2)).toBe(plaintext);
    // New envelope carries version 2
    expect(decodeEnvelope(newEnvelope).v).toBe(2);
    // Old envelope still decrypts with key1 (original unchanged)
    expect(decryptPayload(oldEnvelope, key1)).toBe(plaintext);
  });

  it('fails cleanly when the wrong old key is supplied', () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const wrongKey = makeKey();

    const oldEnvelope = encryptPayload('data', key1, 1);
    expect(() => reEncryptPayload(oldEnvelope, wrongKey, key2, 2)).toThrow(/Decryption failed/);
  });
});
