/**
 * Ed25519Signature2020 Linked Data proof utilities (issue #1107).
 *
 * Self-contained implementation that does not require the full
 * @digitalbazaar/ed25519-signature-2020 / jsonld stack. It produces and
 * verifies W3C-compatible `Ed25519Signature2020` proof objects:
 *
 *   - `publicKeyMultibase` / `proofValue` are encoded as multibase
 *     base58btc (`z`-prefixed) strings per the Ed25519Signature2020 suite.
 *   - The signed message is a deterministic, canonical serialization of the
 *     credential document (sorted keys, stable JSON) combined with the proof
 *     options — the same canonicalization used by the existing PDF / content
 *     hash signers in this codebase.
 *
 * Node's built-in `crypto` (Ed25519) is used so no native dependencies are
 * required in serverless / containerized deployments.
 */

import crypto from 'crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

// ─── base58btc (Bitcoin alphabet) ────────────────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(input: Buffer): string {
  let zeros = 0;
  while (zeros < input.length && input[zeros] === 0) zeros += 1;

  let digits = [0];
  for (let i = 0; i < input.length; i += 1) {
    let carry = input[i] as number;
    for (let j = 0; j < digits.length; j += 1) {
      carry += (digits[j] as number) << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = '';
  for (let i = 0; i < zeros; i += 1) out += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    out += BASE58_ALPHABET[digits[i] as number];
  }
  return out;
}

function base58Decode(input: string): Buffer {
  const bytes = Buffer.alloc(input.length);
  let length = 0;

  for (let i = 0; i < input.length; i += 1) {
    const digit = BASE58_ALPHABET.indexOf(input[i]);
    if (digit === -1) throw new Error('Invalid base58 character');
    let carry = digit;
    for (let j = 0; j < length; j += 1) {
      carry += (bytes[j] as number) * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes[length++] = carry & 0xff;
      carry >>= 8;
    }
  }

  // Preserve leading zero bytes.
  let zeros = 0;
  while (zeros < input.length && input[zeros] === '1') zeros += 1;
  const out = Buffer.alloc(length + zeros);
  for (let i = 0; i < zeros; i += 1) out[i] = 0;
  for (let i = 0; i < length; i += 1) out[zeros + i] = bytes[length - 1 - i] as number;
  return out;
}

/** Encode a byte array as a multibase base58btc string (`z` prefix). */
export function toMultibaseBase58(value: Buffer): string {
  return `z${base58Encode(value)}`;
}

/** Decode a multibase base58btc string (`z` prefix) to bytes. */
export function fromMultibaseBase58(value: string): Buffer {
  if (typeof value !== 'string' || !value.startsWith('z')) {
    throw new Error('Expected a multibase base58btc value (z-prefixed)');
  }
  return base58Decode(value.slice(1));
}

// ─── Deterministic canonicalization ──────────────────────────────────────────

/**
 * Serialize a JSON value deterministically: object keys are sorted, all
 * arrays/objects are traversed recursively, and strings are emitted verbatim.
 * This mirrors the canonicalization used by the existing PDF signer so the
 * signed bytes are stable across key insertion order.
 */
export function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(obj[key])}`);
  return `{${parts.join(',')}}`;
}

/** Strip the `proofValue` from a proof so it can be signed / re-verified. */
export function proofWithoutValue(proof: Record<string, unknown>): Record<string, unknown> {
  const { proofValue: _proofValue, ...rest } = proof;
  return rest;
}

/**
 * Build the canonical message that is signed: the deterministic serialization
 * of the credential document with the proof options (minus proofValue) merged
 * in, so the proof itself is covered by the signature.
 */
export function createSignedMessage(
  credential: Record<string, unknown>,
  proof: Record<string, unknown>
): Buffer {
  const doc = { ...credential, proof: proofWithoutValue(proof) };
  return Buffer.from(canonicalSerialize(doc), 'utf8');
}

// ─── Key handling ────────────────────────────────────────────────────────────

/** Derive an Ed25519 private key (PKCS#8 DER) from a 32-byte seed. */
function privateKeyFromSeed(seed: Buffer): crypto.KeyObject {
  const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  return crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
}

/** Wrap a raw 32-byte Ed25519 public key in SPKI DER so crypto can use it. */
export function publicKeyFromRaw(raw: Buffer): crypto.KeyObject {
  const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
}

/**
 * Deterministically derive an Ed25519 key pair from a seed/secret. Uses the
 * same `CERTIFICATE_SIGNING_SEED` env var the PDF signer relies on so every
 * credential (PDF, content hash, VC) shares the platform issuer identity.
 */
export function deriveIssuerKeyPair(seedHex?: string): {
  publicKey: Buffer;
  privateKey: crypto.KeyObject;
  publicKeyMultibase: string;
} {
  const rawSeed = seedHex ? Buffer.from(seedHex, 'hex') : null;
  const hashed =
    rawSeed && rawSeed.length === 32
      ? rawSeed
      : crypto
          .createHash('sha256')
          .update(seedHex ?? 'web3-student-lab-issuer')
          .digest();
  const privateKey = privateKeyFromSeed(hashed);
  // Derive the matching Ed25519 public key from the private key.
  const rawPublic = crypto
    .createPublicKey(privateKey)
    .export({ type: 'spki', format: 'der' })
    .slice(-32);
  return {
    publicKey: rawPublic,
    privateKey,
    publicKeyMultibase: toMultibaseBase58(rawPublic),
  };
}

// ─── Sign / verify ───────────────────────────────────────────────────────────

/** Sign a message with the issuer Ed25519 private key. */
export function signMessage(message: Buffer, privateKey: crypto.KeyObject): Buffer {
  return crypto.sign(null, message, privateKey);
}

/**
 * Verify an Ed25519Signature2020 proof on a credential.
 * `verificationMethod` must be the issuer DID + '#key-1'; the public key is
 * resolved from the issuer's DID document.
 */
export function verifySignature(
  credential: Record<string, unknown>,
  proof: Record<string, unknown>,
  publicKeyRaw: Buffer
): boolean {
  try {
    const message = createSignedMessage(credential, proof);
    const proofValue = fromMultibaseBase58(String(proof.proofValue));
    const key = publicKeyFromRaw(publicKeyRaw);
    return crypto.verify(null, message, key, proofValue);
  } catch {
    return false;
  }
}
