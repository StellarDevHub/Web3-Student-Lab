import { Keypair, StrKey } from '@stellar/stellar-sdk';

export type P2PCryptoCurve = 'P-256';

export interface P2PPublicIdentity {
  keyId: string;
  curve: P2PCryptoCurve;
  publicKeyJwk: JsonWebKey;
  createdAt: number;
}

export interface EncryptedP2PMessage {
  version: 1;
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM';
  keyId: string;
  senderKeyId: string;
  recipientKeyId: string;
  iv: string;
  ciphertext: string;
  aad: string;
  createdAt: number;
}

export interface StoredConversationKey {
  conversationId: string;
  senderKeyId: string;
  recipientKeyId: string;
  key: CryptoKey;
  createdAt: number;
}

interface StoredIdentity {
  keyId: string;
  curve: P2PCryptoCurve;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  createdAt: number;
}

const DB_NAME = 'web3-student-lab-p2p-crypto';
const DB_VERSION = 1;
const IDENTITY_STORE = 'identityKeys';
const CONVERSATION_STORE = 'conversationKeys';
const DEFAULT_IDENTITY_ID = 'default';
const CURVE: P2PCryptoCurve = 'P-256';
const MESSAGE_VERSION = 1;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function assertBrowserCrypto(): SubtleCrypto {
  if (typeof window === 'undefined' || !window.crypto?.subtle || !window.indexedDB) {
    throw new Error('P2P encryption requires browser Web Crypto and IndexedDB support.');
  }

  return window.crypto.subtle;
}

function openCryptoDb(): Promise<IDBDatabase> {
  assertBrowserCrypto();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE);
      }
      if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
        db.createObjectStore(CONVERSATION_STORE, { keyPath: 'conversationId' });
      }
    };

    request.onerror = () => reject(request.error ?? new Error('Failed to open crypto store.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function readStore<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openCryptoDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);

        /* v8 ignore next -- IndexedDB request failures are browser runtime failures. */
        request.onerror = () => reject(request.error ?? new Error('Failed to read crypto store.'));
        request.onsuccess = () => resolve(request.result as T | undefined);
        tx.oncomplete = () => db.close();
        /* v8 ignore next 4 -- IndexedDB transaction failures are browser runtime failures. */
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Crypto store read transaction failed.'));
        };
      })
  );
}

function writeStore<T>(storeName: string, value: T, key?: IDBValidKey): Promise<void> {
  return openCryptoDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = key === undefined ? store.put(value) : store.put(value, key);

        /* v8 ignore next -- IndexedDB request failures are browser runtime failures. */
        request.onerror = () => reject(request.error ?? new Error('Failed to write crypto store.'));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        /* v8 ignore next 4 -- IndexedDB transaction failures are browser runtime failures. */
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Crypto store write transaction failed.'));
        };
      })
  );
}

function deleteStoreValue(storeName: string, key: IDBValidKey): Promise<void> {
  return openCryptoDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).delete(key);

        /* v8 ignore next -- IndexedDB request failures are browser runtime failures. */
        request.onerror = () => reject(request.error ?? new Error('Failed to delete crypto key.'));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        /* v8 ignore next 4 -- IndexedDB transaction failures are browser runtime failures. */
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Crypto store delete transaction failed.'));
        };
      })
  );
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.subarray(index, index + chunkSize));
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function sha256Base64Url(data: string): Promise<string> {
  const digest = await assertBrowserCrypto().digest('SHA-256', TEXT_ENCODER.encode(data));
  return base64UrlEncode(digest);
}

function canonicalPublicKey(jwk: JsonWebKey): string {
  return JSON.stringify({
    crv: jwk.crv,
    ext: jwk.ext,
    key_ops: jwk.key_ops,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
}

function buildConversationId(senderKeyId: string, recipientKeyId: string): string {
  return [senderKeyId, recipientKeyId].sort().join(':');
}

function buildAad(senderKeyId: string, recipientKeyId: string, createdAt: number): string {
  return JSON.stringify({
    version: MESSAGE_VERSION,
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM',
    senderKeyId,
    recipientKeyId,
    createdAt,
  });
}

async function importPeerPublicKey(identity: P2PPublicIdentity): Promise<CryptoKey> {
  if (identity.curve !== CURVE) {
    throw new Error(`Unsupported P2P key curve: ${identity.curve}`);
  }

  const expectedKeyId = await fingerprintP2PIdentity(identity);
  if (expectedKeyId !== identity.keyId) {
    throw new Error('Peer public key fingerprint does not match its advertised key identifier.');
  }

  return assertBrowserCrypto().importKey(
    'jwk',
    identity.publicKeyJwk,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    []
  );
}

export async function fingerprintP2PIdentity(identity: Pick<P2PPublicIdentity, 'publicKeyJwk'>): Promise<string> {
  return sha256Base64Url(canonicalPublicKey(identity.publicKeyJwk));
}

export async function verifyP2PIdentity(identity: P2PPublicIdentity): Promise<boolean> {
  if (identity.curve !== CURVE) return false;
  return fingerprintP2PIdentity(identity).then((fingerprint) => fingerprint === identity.keyId);
}

async function deriveConversationKey(
  ownPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  senderKeyId: string,
  recipientKeyId: string
): Promise<CryptoKey> {
  const cryptoApi = assertBrowserCrypto();
  const sharedSecret = await cryptoApi.deriveBits({ name: 'ECDH', public: peerPublicKey }, ownPrivateKey, 256);

  try {
    const hkdfMaterial = await cryptoApi.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
    const salt = await cryptoApi.digest('SHA-256', TEXT_ENCODER.encode(buildConversationId(senderKeyId, recipientKeyId)));
    const info = TEXT_ENCODER.encode('web3-student-lab:p2p-message:v1');

    return cryptoApi.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      hkdfMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } finally {
    new Uint8Array(sharedSecret).fill(0);
  }
}

async function getStoredIdentity(): Promise<StoredIdentity | undefined> {
  return readStore<StoredIdentity>(IDENTITY_STORE, DEFAULT_IDENTITY_ID);
}

export async function getOrCreateP2PIdentity(): Promise<P2PPublicIdentity> {
  const existing = await getStoredIdentity();
  if (existing) {
    return {
      keyId: existing.keyId,
      curve: existing.curve,
      publicKeyJwk: existing.publicKeyJwk,
      createdAt: existing.createdAt,
    };
  }

  const cryptoApi = assertBrowserCrypto();
  const pair = await cryptoApi.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    false,
    ['deriveBits']
  );
  const publicKeyJwk = await cryptoApi.exportKey('jwk', pair.publicKey);
  const keyId = await sha256Base64Url(canonicalPublicKey(publicKeyJwk));
  const createdAt = Date.now();

  await writeStore<StoredIdentity>(
    IDENTITY_STORE,
    {
      keyId,
      curve: CURVE,
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      publicKeyJwk,
      createdAt,
    },
    DEFAULT_IDENTITY_ID
  );

  return { keyId, curve: CURVE, publicKeyJwk, createdAt };
}

export async function resetP2PIdentity(): Promise<void> {
  await deleteStoreValue(IDENTITY_STORE, DEFAULT_IDENTITY_ID);
}

export async function getOrCreateConversationKey(
  peerIdentity: P2PPublicIdentity
): Promise<StoredConversationKey> {
  const ownIdentity = await getStoredIdentity();
  if (!ownIdentity) {
    await getOrCreateP2PIdentity();
  }

  const latestOwnIdentity = await getStoredIdentity();
  /* v8 ignore next 3 -- getOrCreateP2PIdentity either persists or throws before this guard. */
  if (!latestOwnIdentity) {
    throw new Error('Unable to initialize local P2P identity.');
  }

  const conversationId = buildConversationId(latestOwnIdentity.keyId, peerIdentity.keyId);
  const existing = await readStore<StoredConversationKey>(CONVERSATION_STORE, conversationId);
  if (existing) {
    return existing;
  }

  const peerPublicKey = await importPeerPublicKey(peerIdentity);
  const key = await deriveConversationKey(
    latestOwnIdentity.privateKey,
    peerPublicKey,
    latestOwnIdentity.keyId,
    peerIdentity.keyId
  );
  const conversationKey: StoredConversationKey = {
    conversationId,
    senderKeyId: latestOwnIdentity.keyId,
    recipientKeyId: peerIdentity.keyId,
    key,
    createdAt: Date.now(),
  };

  await writeStore(CONVERSATION_STORE, conversationKey);
  return conversationKey;
}

export async function encryptP2PMessage(
  peerIdentity: P2PPublicIdentity,
  plaintext: string
): Promise<EncryptedP2PMessage> {
  if (!plaintext.trim()) {
    throw new Error('Cannot encrypt an empty message.');
  }

  const ownIdentity = await getOrCreateP2PIdentity();
  const conversationKey = await getOrCreateConversationKey(peerIdentity);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const createdAt = Date.now();
  const aad = buildAad(ownIdentity.keyId, peerIdentity.keyId, createdAt);
  const ciphertext = await assertBrowserCrypto().encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: TEXT_ENCODER.encode(aad),
      tagLength: 128,
    },
    conversationKey.key,
    TEXT_ENCODER.encode(plaintext)
  );

  return {
    version: MESSAGE_VERSION,
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM',
    keyId: conversationKey.conversationId,
    senderKeyId: ownIdentity.keyId,
    recipientKeyId: peerIdentity.keyId,
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(ciphertext),
    aad,
    createdAt,
  };
}

export async function decryptP2PMessage(
  peerIdentity: P2PPublicIdentity,
  payload: EncryptedP2PMessage
): Promise<string> {
  const ownIdentity = await getOrCreateP2PIdentity();

  if (payload.version !== MESSAGE_VERSION || payload.algorithm !== 'ECDH-P256-HKDF-SHA256-AES-GCM') {
    throw new Error('Unsupported encrypted message format.');
  }

  const isInbound =
    payload.senderKeyId === peerIdentity.keyId && payload.recipientKeyId === ownIdentity.keyId;
  const isLocalEcho =
    payload.senderKeyId === ownIdentity.keyId && payload.recipientKeyId === peerIdentity.keyId;

  if (!isInbound && !isLocalEcho) {
    throw new Error('Encrypted message key identifiers do not match this conversation.');
  }

  const expectedAad = buildAad(payload.senderKeyId, payload.recipientKeyId, payload.createdAt);
  if (payload.aad !== expectedAad) {
    throw new Error('Encrypted message authentication metadata is invalid.');
  }

  const conversationKey = await getOrCreateConversationKey(peerIdentity);
  const plaintext = await assertBrowserCrypto().decrypt(
    {
      name: 'AES-GCM',
      iv: toCryptoBytes(base64UrlDecode(payload.iv)),
      additionalData: TEXT_ENCODER.encode(payload.aad),
      tagLength: 128,
    },
    conversationKey.key,
    toCryptoBytes(base64UrlDecode(payload.ciphertext))
  );

  return TEXT_DECODER.decode(plaintext);
}

export function estimateEncryptedPayloadSize(payload: EncryptedP2PMessage): number {
  return payload.iv.length + payload.ciphertext.length + payload.aad.length + 128;
}

// ---------------------------------------------------------------------------
// Authenticated Ephemeral ECDH + Stellar Ed25519 Key Agreement (FE-074)
// ---------------------------------------------------------------------------

export interface StellarEd25519Signer {
  /** Stellar Ed25519 G... public key */
  publicKey: string;
  /** Signs arbitrary bytes with the participant's Stellar Ed25519 wallet key */
  sign: (message: Uint8Array) => Promise<Uint8Array> | Uint8Array;
}

export interface SignedEphemeralKeyBundle {
  version: 1;
  roomId: string;
  stellarPublicKey: string;
  ephemeralPublicKeyJwk: JsonWebKey;
  ephemeralKeyId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

export interface EphemeralKeyAgreementSession {
  roomId: string;
  localStellarPublicKey: string;
  localBundle: SignedEphemeralKeyBundle;
  localPrivateKey: CryptoKey;
}

export interface VerifiedPeerKeyAgreement {
  roomId: string;
  localStellarPublicKey: string;
  peerStellarPublicKey: string;
  peerEphemeralKeyId: string;
  sessionId: string;
  /** AES-256-GCM key for encrypting WebRTC data channel payloads */
  dataChannelKey: CryptoKey;
  /** AES-256-GCM key for encrypting WebRTC audio/video media frames */
  mediaFrameKey: CryptoKey;
  /** Derived secret string for end-to-end encrypted collaborative editor sync */
  editorSyncSecret: string;
  verifiedAt: number;
}

export type PeerIdentityFailureCode =
  | 'INVALID_PUBLIC_KEY'
  | 'ROOM_MISMATCH'
  | 'EXPIRED_BUNDLE'
  | 'KEY_ID_MISMATCH'
  | 'INVALID_SIGNATURE'
  | 'IDENTITY_MISMATCH';

export type PeerIdentityVerificationResult =
  | { valid: true; peerStellarPublicKey: string; ephemeralKeyId: string }
  | { valid: false; reason: string; code: PeerIdentityFailureCode };

export class PeerIdentityMismatchError extends Error {
  readonly code: PeerIdentityFailureCode;

  constructor(code: PeerIdentityFailureCode, message: string) {
    super(message);
    this.name = 'PeerIdentityMismatchError';
    this.code = code;
  }
}

export interface EncryptedDataChannelEnvelope {
  v: 1;
  iv: string;
  ct: string;
}

const WEBRTC_KEY_AGREEMENT_DOMAIN = 'web3-student-lab:webrtc-ed25519-ecdh:v1:';
const DEFAULT_BUNDLE_TTL_MS = 5 * 60 * 1000;

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is required for WebRTC key agreement.');
  }
  return subtle;
}

function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256Base64UrlAny(data: string): Promise<string> {
  const digest = await getSubtleCrypto().digest('SHA-256', TEXT_ENCODER.encode(data));
  return base64UrlEncode(digest);
}

/**
 * Creates a Stellar Ed25519 signer backed by a local Keypair (random if no secret is supplied).
 */
export function createLocalStellarEd25519Signer(secret?: string): StellarEd25519Signer {
  const keypair = secret ? Keypair.fromSecret(secret) : Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    sign: (message: Uint8Array) => Uint8Array.from(keypair.sign(Buffer.from(message))),
  };
}

/**
 * Produces the canonical domain-separated byte payload signed by a participant's Stellar Ed25519 key.
 */
export function buildCanonicalKeyBundlePayload(
  bundle: Omit<SignedEphemeralKeyBundle, 'signature'>
): Uint8Array {
  const canonical = JSON.stringify({
    version: bundle.version,
    roomId: bundle.roomId,
    stellarPublicKey: bundle.stellarPublicKey,
    ephemeralPublicKeyJwk: canonicalPublicKey(bundle.ephemeralPublicKeyJwk),
    ephemeralKeyId: bundle.ephemeralKeyId,
    nonce: bundle.nonce,
    issuedAt: bundle.issuedAt,
    expiresAt: bundle.expiresAt,
  });

  return TEXT_ENCODER.encode(`${WEBRTC_KEY_AGREEMENT_DOMAIN}${canonical}`);
}

/**
 * Generates an ephemeral ECDH P-256 keypair and signs its public key bundle with the
 * participant's Stellar Ed25519 wallet key prior to WebRTC connection establishment.
 */
export async function createSignedEphemeralKeySession(
  roomId: string,
  signer: StellarEd25519Signer,
  ttlMs: number = DEFAULT_BUNDLE_TTL_MS
): Promise<EphemeralKeyAgreementSession> {
  if (!roomId.trim()) {
    throw new Error('A non-empty roomId is required for WebRTC key agreement.');
  }
  if (!StrKey.isValidEd25519PublicKey(signer.publicKey)) {
    throw new PeerIdentityMismatchError(
      'INVALID_PUBLIC_KEY',
      'Local Stellar signer public key is not a valid Ed25519 key.'
    );
  }

  const subtle = getSubtleCrypto();
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, false, ['deriveBits']);
  const ephemeralPublicKeyJwk = await subtle.exportKey('jwk', pair.publicKey);
  const ephemeralKeyId = await sha256Base64UrlAny(canonicalPublicKey(ephemeralPublicKeyJwk));
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const nonce = base64UrlEncode(getRandomBytes(16));

  const unsignedBundle: Omit<SignedEphemeralKeyBundle, 'signature'> = {
    version: 1,
    roomId,
    stellarPublicKey: signer.publicKey,
    ephemeralPublicKeyJwk,
    ephemeralKeyId,
    nonce,
    issuedAt,
    expiresAt,
  };

  const payload = buildCanonicalKeyBundlePayload(unsignedBundle);
  const signatureBytes = await signer.sign(payload);

  const localBundle: SignedEphemeralKeyBundle = {
    ...unsignedBundle,
    signature: base64UrlEncode(signatureBytes),
  };

  return {
    roomId,
    localStellarPublicKey: signer.publicKey,
    localBundle,
    localPrivateKey: pair.privateKey,
  };
}

/**
 * Verifies a peer's signed ephemeral ECDH key bundle against its Stellar Ed25519 public key.
 */
export async function verifySignedEphemeralKeyBundle(
  bundle: SignedEphemeralKeyBundle,
  options: {
    expectedRoomId: string;
    expectedStellarPublicKey?: string;
    now?: number;
  }
): Promise<PeerIdentityVerificationResult> {
  if (!bundle || !StrKey.isValidEd25519PublicKey(bundle.stellarPublicKey)) {
    return {
      valid: false,
      code: 'INVALID_PUBLIC_KEY',
      reason: 'Peer presented an invalid Stellar Ed25519 public key.',
    };
  }

  if (
    options.expectedStellarPublicKey &&
    bundle.stellarPublicKey !== options.expectedStellarPublicKey
  ) {
    return {
      valid: false,
      code: 'IDENTITY_MISMATCH',
      reason: `Peer identity mismatch: expected ${options.expectedStellarPublicKey}, received ${bundle.stellarPublicKey}.`,
    };
  }

  if (bundle.roomId !== options.expectedRoomId) {
    return {
      valid: false,
      code: 'ROOM_MISMATCH',
      reason: `Peer key bundle was issued for room "${bundle.roomId}", expected "${options.expectedRoomId}".`,
    };
  }

  const now = options.now ?? Date.now();
  if (now > bundle.expiresAt) {
    return {
      valid: false,
      code: 'EXPIRED_BUNDLE',
      reason: 'Peer signed ephemeral key bundle has expired.',
    };
  }

  const computedKeyId = await sha256Base64UrlAny(canonicalPublicKey(bundle.ephemeralPublicKeyJwk));
  if (computedKeyId !== bundle.ephemeralKeyId) {
    return {
      valid: false,
      code: 'KEY_ID_MISMATCH',
      reason: 'Peer ephemeral public key fingerprint does not match the advertised key identifier.',
    };
  }

  try {
    const { signature, ...unsigned } = bundle;
    const payload = buildCanonicalKeyBundlePayload(unsigned);
    const sigBytes = base64UrlDecode(signature);
    const keypair = Keypair.fromPublicKey(bundle.stellarPublicKey);
    const verified = keypair.verify(Buffer.from(payload), Buffer.from(sigBytes));

    if (!verified) {
      return {
        valid: false,
        code: 'INVALID_SIGNATURE',
        reason: 'Ed25519 signature verification failed for peer ephemeral public key.',
      };
    }
  } catch {
    return {
      valid: false,
      code: 'INVALID_SIGNATURE',
      reason: 'Malformed Ed25519 signature on peer ephemeral public key.',
    };
  }

  return {
    valid: true,
    peerStellarPublicKey: bundle.stellarPublicKey,
    ephemeralKeyId: bundle.ephemeralKeyId,
  };
}

/**
 * Verifies the peer's Ed25519-signed ephemeral ECDH public key and derives shared
 * AES-256-GCM keys for WebRTC data channels, audio/video media frames, and editor sync.
 */
export async function completeAuthenticatedKeyAgreement(
  session: EphemeralKeyAgreementSession,
  peerBundle: SignedEphemeralKeyBundle,
  expectedPeerStellarPublicKey?: string
): Promise<VerifiedPeerKeyAgreement> {
  const verification = await verifySignedEphemeralKeyBundle(peerBundle, {
    expectedRoomId: session.roomId,
    expectedStellarPublicKey: expectedPeerStellarPublicKey,
  });

  if (!verification.valid) {
    throw new PeerIdentityMismatchError(verification.code, verification.reason);
  }

  const subtle = getSubtleCrypto();
  const peerPublicKey = await subtle.importKey(
    'jwk',
    peerBundle.ephemeralPublicKeyJwk,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    []
  );

  const sharedSecret = await subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    session.localPrivateKey,
    256
  );

  try {
    const hkdfKey = await subtle.importKey('raw', sharedSecret, 'HKDF', false, [
      'deriveKey',
      'deriveBits',
    ]);
    const sortedPeers = [session.localStellarPublicKey, peerBundle.stellarPublicKey].sort();
    const sessionTranscript = `${session.roomId}:${sortedPeers[0]}:${sortedPeers[1]}`;
    const salt = await subtle.digest('SHA-256', TEXT_ENCODER.encode(sessionTranscript));
    const sessionId = base64UrlEncode(salt);

    const [dataChannelKey, mediaFrameKey, editorSyncBits] = await Promise.all([
      subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt,
          info: TEXT_ENCODER.encode('web3-student-lab:webrtc-data-channel:v1'),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      ),
      subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt,
          info: TEXT_ENCODER.encode('web3-student-lab:webrtc-media-frame:v1'),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      ),
      subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt,
          info: TEXT_ENCODER.encode('web3-student-lab:webrtc-editor-sync:v1'),
        },
        hkdfKey,
        256
      ),
    ]);

    return {
      roomId: session.roomId,
      localStellarPublicKey: session.localStellarPublicKey,
      peerStellarPublicKey: peerBundle.stellarPublicKey,
      peerEphemeralKeyId: peerBundle.ephemeralKeyId,
      sessionId,
      dataChannelKey,
      mediaFrameKey,
      editorSyncSecret: base64UrlEncode(editorSyncBits),
      verifiedAt: Date.now(),
    };
  } finally {
    new Uint8Array(sharedSecret).fill(0);
  }
}

/**
 * Encrypts a WebRTC data channel payload using the agreed AES-256-GCM dataChannelKey.
 */
export async function encryptDataChannelPayload(
  key: CryptoKey,
  plaintext: string | Uint8Array
): Promise<string> {
  const subtle = getSubtleCrypto();
  const iv = getRandomBytes(12);
  const data = typeof plaintext === 'string' ? TEXT_ENCODER.encode(plaintext) : toCryptoBytes(plaintext);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data);

  const envelope: EncryptedDataChannelEnvelope = {
    v: 1,
    iv: base64UrlEncode(iv),
    ct: base64UrlEncode(ciphertext),
  };

  return JSON.stringify(envelope);
}

/**
 * Decrypts a WebRTC data channel payload using the agreed AES-256-GCM dataChannelKey.
 */
export async function decryptDataChannelPayload(
  key: CryptoKey,
  encoded: string
): Promise<Uint8Array> {
  const envelope = JSON.parse(encoded) as EncryptedDataChannelEnvelope;
  if (envelope.v !== 1 || !envelope.iv || !envelope.ct) {
    throw new Error('Invalid encrypted WebRTC data channel envelope.');
  }

  const subtle = getSubtleCrypto();
  const plaintext = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toCryptoBytes(base64UrlDecode(envelope.iv)),
      tagLength: 128,
    },
    key,
    toCryptoBytes(base64UrlDecode(envelope.ct))
  );

  return new Uint8Array(plaintext);
}

/**
 * Encrypts a WebRTC audio/video encoded media frame (AES-256-GCM with 12-byte IV prefix).
 */
export async function encryptMediaFrame(
  key: CryptoKey,
  frameData: ArrayBuffer
): Promise<ArrayBuffer> {
  const subtle = getSubtleCrypto();
  const iv = getRandomBytes(12);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    frameData
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return combined.buffer;
}

/**
 * Decrypts a WebRTC audio/video encoded media frame (AES-256-GCM with 12-byte IV prefix).
 */
export async function decryptMediaFrame(
  key: CryptoKey,
  encryptedFrame: ArrayBuffer
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(encryptedFrame);
  if (bytes.byteLength <= 12) {
    throw new Error('Encrypted media frame is too short.');
  }

  const iv = toCryptoBytes(bytes.subarray(0, 12));
  const ciphertext = toCryptoBytes(bytes.subarray(12));
  const subtle = getSubtleCrypto();

  return subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext);
}
