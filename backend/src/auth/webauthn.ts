/**
 * WebAuthn primitives — BE-008
 *
 * Dependency-free implementation of the parts of W3C WebAuthn Level 2/3 the
 * relying party needs: a strict CBOR decoder (RFC 8949 subset used by CTAP2),
 * authenticator-data parsing, COSE_Key → Node KeyObject conversion, signature
 * verification, and attestation-statement verification for the `none`,
 * `packed` (self and x5c) and `fido-u2f` formats.
 *
 * All verification failures throw `WebAuthnError` with a stable `code`.
 */

import { createHash, createPublicKey, verify as cryptoVerify, X509Certificate, type KeyObject } from 'crypto';

export class WebAuthnError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

const fail = (code: string, message: string): never => {
  throw new WebAuthnError(code, message);
};

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function fromBase64Url(value: unknown, field = 'value'): Buffer {
  if (typeof value !== 'string' || !BASE64URL.test(value)) {
    fail('invalid-encoding', `${field} must be base64url`);
  }
  return Buffer.from(value as string, 'base64url');
}

export const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

export const sha256 = (data: Uint8Array): Buffer => createHash('sha256').update(data).digest();

// ---------------------------------------------------------------------------
// CBOR (definite-length subset, as mandated by CTAP2 canonical encoding)
// ---------------------------------------------------------------------------

export type CborValue = number | bigint | string | boolean | null | undefined | Buffer | CborValue[] | CborMap;
export type CborMap = Map<CborValue, CborValue>;

const MAX_CBOR_DEPTH = 16;

export function decodeCbor(input: Uint8Array, offset = 0): { value: CborValue; offset: number } {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  let pos = offset;

  const need = (n: number) => {
    if (pos + n > buf.length) fail('invalid-cbor', 'unexpected end of CBOR data');
  };

  const readLength = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) {
      need(1);
      return buf.readUInt8(pos++);
    }
    if (info === 25) {
      need(2);
      const v = buf.readUInt16BE(pos);
      pos += 2;
      return v;
    }
    if (info === 26) {
      need(4);
      const v = buf.readUInt32BE(pos);
      pos += 4;
      return v;
    }
    if (info === 27) {
      need(8);
      const v = buf.readBigUInt64BE(pos);
      pos += 8;
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid-cbor', 'CBOR integer too large');
      return Number(v);
    }
    return fail('invalid-cbor', 'indefinite-length CBOR items are not allowed');
  };

  const readItem = (depth: number): CborValue => {
    if (depth > MAX_CBOR_DEPTH) fail('invalid-cbor', 'CBOR nesting too deep');
    need(1);
    const initial = buf.readUInt8(pos++);
    const major = initial >> 5;
    const info = initial & 0x1f;

    switch (major) {
      case 0:
        return readLength(info);
      case 1:
        return -1 - readLength(info);
      case 2: {
        const len = readLength(info);
        need(len);
        const bytes = Buffer.from(buf.subarray(pos, pos + len));
        pos += len;
        return bytes;
      }
      case 3: {
        const len = readLength(info);
        need(len);
        const text = buf.toString('utf8', pos, pos + len);
        pos += len;
        return text;
      }
      case 4: {
        const len = readLength(info);
        const items: CborValue[] = [];
        for (let i = 0; i < len; i++) items.push(readItem(depth + 1));
        return items;
      }
      case 5: {
        const len = readLength(info);
        const map: CborMap = new Map();
        for (let i = 0; i < len; i++) {
          const key = readItem(depth + 1);
          if (typeof key !== 'number' && typeof key !== 'string') fail('invalid-cbor', 'unsupported CBOR map key');
          if (map.has(key)) fail('invalid-cbor', 'duplicate CBOR map key');
          map.set(key, readItem(depth + 1));
        }
        return map;
      }
      case 6:
        readLength(info); // tag number — value is decoded untagged
        return readItem(depth + 1);
      default:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        if (info === 23) return undefined;
        return fail('invalid-cbor', `unsupported CBOR simple/float value ${info}`);
    }
  };

  const value = readItem(0);
  return { value, offset: pos };
}

const asMap = (value: CborValue, what: string): CborMap =>
  value instanceof Map ? value : fail('invalid-cbor', `${what} must be a CBOR map`);

// ---------------------------------------------------------------------------
// Authenticator data (§6.1)
// ---------------------------------------------------------------------------

export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
export const FLAG_BE = 0x08;
export const FLAG_BS = 0x10;
export const FLAG_AT = 0x40;
export const FLAG_ED = 0x80;

export interface AuthenticatorData {
  raw: Buffer;
  rpIdHash: Buffer;
  flags: { userPresent: boolean; userVerified: boolean; backupEligible: boolean; backedUp: boolean };
  signCount: number;
  attestedCredential?: { aaguid: Buffer; credentialId: Buffer; publicKey: Buffer };
}

export function parseAuthenticatorData(raw: Buffer): AuthenticatorData {
  if (raw.length < 37) fail('invalid-authenticator-data', 'authenticator data is too short');
  const flags = raw.readUInt8(32);
  const backupEligible = (flags & FLAG_BE) !== 0;
  const backedUp = (flags & FLAG_BS) !== 0;
  if (backedUp && !backupEligible) {
    fail('invalid-authenticator-data', 'backup state set on a credential that is not backup eligible');
  }

  const result: AuthenticatorData = {
    raw,
    rpIdHash: raw.subarray(0, 32),
    flags: { userPresent: (flags & FLAG_UP) !== 0, userVerified: (flags & FLAG_UV) !== 0, backupEligible, backedUp },
    signCount: raw.readUInt32BE(33),
  };

  let pos = 37;
  if (flags & FLAG_AT) {
    if (raw.length < pos + 18) fail('invalid-authenticator-data', 'attested credential data is truncated');
    const aaguid = raw.subarray(pos, pos + 16);
    const idLength = raw.readUInt16BE(pos + 16);
    pos += 18;
    if (idLength > 1023) fail('invalid-authenticator-data', 'credential ID exceeds 1023 bytes');
    if (raw.length < pos + idLength) fail('invalid-authenticator-data', 'credential ID is truncated');
    const credentialId = raw.subarray(pos, pos + idLength);
    pos += idLength;
    const keyEnd = decodeCbor(raw, pos).offset;
    result.attestedCredential = { aaguid, credentialId, publicKey: raw.subarray(pos, keyEnd) };
    pos = keyEnd;
  }
  if (flags & FLAG_ED) {
    pos = decodeCbor(raw, pos).offset;
  }
  if (pos !== raw.length) fail('invalid-authenticator-data', 'unexpected trailing bytes in authenticator data');
  return result;
}

// ---------------------------------------------------------------------------
// COSE keys & signatures
// ---------------------------------------------------------------------------

export const COSE_ALG = { ES256: -7, EdDSA: -8, ES384: -35, ES512: -36, RS256: -257 } as const;
export const SUPPORTED_ALGORITHMS: number[] = Object.values(COSE_ALG);

const EC2_CURVES: Record<number, { crv: string; alg: number; hash: string }> = {
  1: { crv: 'P-256', alg: COSE_ALG.ES256, hash: 'sha256' },
  2: { crv: 'P-384', alg: COSE_ALG.ES384, hash: 'sha384' },
  3: { crv: 'P-521', alg: COSE_ALG.ES512, hash: 'sha512' },
};

export interface CoseKey {
  alg: number;
  key: KeyObject;
  /** Uncompressed EC point (0x04 || x || y), only for EC2 keys. */
  ecPoint?: Buffer;
  crv?: string;
}

export function parseCoseKey(encoded: Uint8Array): CoseKey {
  const map = asMap(decodeCbor(encoded).value, 'credential public key');
  const kty = map.get(1);
  const alg = map.get(3);
  if (typeof alg !== 'number') return fail('unsupported-key', 'COSE key has no algorithm');

  const bytes = (label: number, what: string): Buffer => {
    const v = map.get(label);
    return Buffer.isBuffer(v) ? v : fail('unsupported-key', `COSE key is missing ${what}`);
  };

  if (kty === 2) {
    const curve = EC2_CURVES[map.get(-1) as number];
    if (!curve || curve.alg !== alg) return fail('unsupported-key', 'unsupported or inconsistent EC2 curve');
    const x = bytes(-2, 'x');
    const y = bytes(-3, 'y');
    const key = createPublicKey({
      key: { kty: 'EC', crv: curve.crv, x: toBase64Url(x), y: toBase64Url(y) },
      format: 'jwk',
    });
    return { alg, key, ecPoint: Buffer.concat([Buffer.from([0x04]), x, y]), crv: curve.crv };
  }
  if (kty === 1) {
    if (map.get(-1) !== 6 || alg !== COSE_ALG.EdDSA) return fail('unsupported-key', 'only Ed25519 OKP keys are supported');
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: toBase64Url(bytes(-2, 'x')) }, format: 'jwk' });
    return { alg, key };
  }
  if (kty === 3) {
    if (alg !== COSE_ALG.RS256) return fail('unsupported-key', 'only RS256 RSA keys are supported');
    const key = createPublicKey({
      key: { kty: 'RSA', n: toBase64Url(bytes(-1, 'n')), e: toBase64Url(bytes(-2, 'e')) },
      format: 'jwk',
    });
    return { alg, key };
  }
  return fail('unsupported-key', `unsupported COSE key type ${String(kty)}`);
}

const hashForAlg = (alg: number): string | null => {
  switch (alg) {
    case COSE_ALG.ES256:
    case COSE_ALG.RS256:
      return 'sha256';
    case COSE_ALG.ES384:
      return 'sha384';
    case COSE_ALG.ES512:
      return 'sha512';
    case COSE_ALG.EdDSA:
      return null;
    default:
      return fail('unsupported-algorithm', `unsupported COSE algorithm ${alg}`);
  }
};

/** WebAuthn ECDSA signatures are ASN.1 DER encoded; Node's default dsaEncoding is 'der'. */
export function verifySignature(alg: number, key: KeyObject, data: Buffer, signature: Buffer): boolean {
  try {
    return cryptoVerify(hashForAlg(alg), data, key, signature);
  } catch (err) {
    if (err instanceof WebAuthnError) throw err;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Attestation statements (§8)
// ---------------------------------------------------------------------------

export type AttestationType = 'none' | 'self' | 'basic';

export interface AttestationResult {
  fmt: string;
  type: AttestationType;
}

/** id-fido-gen-ce-aaguid (1.3.6.1.4.1.45724.1.1.4) DER encoding. */
const AAGUID_EXTENSION_OID = Buffer.from([0x06, 0x0b, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x82, 0xe5, 0x1c, 0x01, 0x01, 0x04]);

/** Extracts the AAGUID certificate extension value, if present (§8.2.1). */
export function readAaguidExtension(certDer: Buffer): { aaguid: Buffer; critical: boolean } | null {
  const at = certDer.indexOf(AAGUID_EXTENSION_OID);
  if (at === -1) return null;
  let pos = at + AAGUID_EXTENSION_OID.length;
  let critical = false;
  if (certDer[pos] === 0x01 && certDer[pos + 1] === 0x01) {
    critical = certDer[pos + 2] !== 0x00;
    pos += 3;
  }
  // extnValue OCTET STRING wrapping an OCTET STRING of 16 bytes.
  if (certDer[pos] !== 0x04 || certDer[pos + 2] !== 0x04 || certDer[pos + 3] !== 0x10) {
    return fail('invalid-attestation', 'malformed AAGUID certificate extension');
  }
  return { aaguid: certDer.subarray(pos + 4, pos + 20), critical };
}

function parseCertificateChain(x5c: CborValue): X509Certificate[] {
  if (!Array.isArray(x5c) || x5c.length === 0) return fail('invalid-attestation', 'x5c must be a non-empty array');
  return x5c.map((der) =>
    Buffer.isBuffer(der) ? new X509Certificate(der) : fail('invalid-attestation', 'x5c entries must be byte strings')
  );
}

function assertChainSignatures(chain: X509Certificate[], now: Date): void {
  chain.forEach((cert, i) => {
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) {
      fail('invalid-attestation', 'attestation certificate is outside its validity period');
    }
    const issuer = chain[i + 1];
    if (issuer && !cert.verify(issuer.publicKey)) {
      fail('invalid-attestation', 'attestation certificate chain signature is invalid');
    }
  });
}

export interface AttestationInput {
  fmt: string;
  attStmt: CborMap;
  authData: AuthenticatorData;
  clientDataHash: Buffer;
  credentialKey: CoseKey;
  now?: Date;
}

export function verifyAttestation(input: AttestationInput): AttestationResult {
  const { fmt, attStmt, authData, clientDataHash, credentialKey } = input;
  const now = input.now ?? new Date();
  const signedData = Buffer.concat([authData.raw, clientDataHash]);
  const credential = authData.attestedCredential!;

  if (fmt === 'none') {
    if (attStmt.size !== 0) fail('invalid-attestation', "'none' attestation must have an empty statement");
    return { fmt, type: 'none' };
  }

  if (fmt === 'packed') {
    const alg = attStmt.get('alg');
    const sig = attStmt.get('sig');
    if (typeof alg !== 'number' || !Buffer.isBuffer(sig)) fail('invalid-attestation', 'packed statement needs alg and sig');

    const x5c = attStmt.get('x5c');
    if (x5c === undefined) {
      // Self attestation: signed by the credential key itself.
      if (alg !== credentialKey.alg) fail('invalid-attestation', 'self attestation alg does not match the credential');
      if (!verifySignature(alg as number, credentialKey.key, signedData, sig as Buffer)) {
        fail('invalid-attestation', 'packed self-attestation signature is invalid');
      }
      return { fmt, type: 'self' };
    }

    const chain = parseCertificateChain(x5c);
    const leaf = chain[0]!;
    if (!verifySignature(alg as number, leaf.publicKey, signedData, sig as Buffer)) {
      fail('invalid-attestation', 'packed attestation signature is invalid');
    }
    // §8.2.1 attestation certificate requirements.
    if (!/OU=Authenticator Attestation/.test(leaf.subject)) {
      fail('invalid-attestation', "attestation certificate subject OU must be 'Authenticator Attestation'");
    }
    if (leaf.ca) fail('invalid-attestation', 'attestation certificate must not be a CA');
    const ext = readAaguidExtension(leaf.raw);
    if (ext) {
      if (ext.critical) fail('invalid-attestation', 'AAGUID extension must not be critical');
      if (!ext.aaguid.equals(credential.aaguid)) fail('invalid-attestation', 'certificate AAGUID does not match');
    }
    assertChainSignatures(chain, now);
    return { fmt, type: 'basic' };
  }

  if (fmt === 'fido-u2f') {
    const sig = attStmt.get('sig');
    const chain = parseCertificateChain(attStmt.get('x5c'));
    if (chain.length !== 1 || !Buffer.isBuffer(sig)) fail('invalid-attestation', 'fido-u2f needs one cert and a sig');
    const leaf = chain[0]!;
    if (leaf.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      fail('invalid-attestation', 'fido-u2f attestation key must be P-256');
    }
    if (credentialKey.alg !== COSE_ALG.ES256 || !credentialKey.ecPoint) {
      fail('invalid-attestation', 'fido-u2f credentials must be ES256');
    }
    const verificationData = Buffer.concat([
      Buffer.from([0x00]),
      authData.rpIdHash,
      clientDataHash,
      credential.credentialId,
      credentialKey.ecPoint!,
    ]);
    if (!verifySignature(COSE_ALG.ES256, leaf.publicKey, verificationData, sig as Buffer)) {
      fail('invalid-attestation', 'fido-u2f attestation signature is invalid');
    }
    assertChainSignatures(chain, now);
    return { fmt, type: 'basic' };
  }

  return fail('unsupported-attestation', `attestation format '${fmt}' is not supported`);
}

export function decodeAttestationObject(raw: Buffer): { fmt: string; attStmt: CborMap; authData: Buffer } {
  const { value, offset } = decodeCbor(raw);
  if (offset !== raw.length) fail('invalid-cbor', 'trailing bytes after attestation object');
  const map = asMap(value, 'attestation object');
  const fmt = map.get('fmt');
  const authData = map.get('authData');
  if (typeof fmt !== 'string' || !Buffer.isBuffer(authData)) fail('invalid-attestation', 'malformed attestation object');
  return { fmt: fmt as string, attStmt: asMap(map.get('attStmt') ?? new Map(), 'attStmt'), authData: authData as Buffer };
}
