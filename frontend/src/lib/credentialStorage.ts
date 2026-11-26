/**
 * Encrypted Credential Storage
 *
 * Client-side encrypted storage for passkey credentials and wallet data.
 * Uses AES-256-GCM through Web Crypto. The device master key is a
 * non-extractable CryptoKey persisted in IndexedDB; optional passphrases use
 * PBKDF2 key derivation.
 *
 * Security properties:
 * - Zero server-side private data: All sensitive data stays on the device
 * - Encrypted at rest: AES-256-GCM encryption for stored credentials
 * - Key storage: non-extractable device key in IndexedDB
 * - Integrity: GCM authentication tag prevents tampering
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredCredential {
  id: string;
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  signCount: number;
  walletAddress?: string;
  deviceName?: string;
  /** User-chosen label, e.g. "Work YubiKey". Falls back to `deviceName`. */
  nickname?: string;
  /** `platform` (Touch ID / Face ID / Windows Hello) or `cross-platform` (security key). */
  authenticatorAttachment?: 'platform' | 'cross-platform';
  transports?: string[];
  /** Whether the authenticator supports the PRF extension (required for SEP-0010 signing). */
  prfEnabled?: boolean;
  /** Stellar account derived from this passkey's PRF output (public key only). */
  stellarPublicKey?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface StoredWalletData {
  walletAddress: string;
  passkeyCredentialId: string;
  guardians: string[];
  createdAt: string;
  lastActivityAt: string;
}

export interface EncryptedData {
  iv: string; // base64-encoded initialization vector
  salt: string; // base64-encoded salt (empty for device-key encryption)
  data: string; // base64-encoded encrypted data
  version: number; // encryption format version
  keyType?: 'device' | 'passphrase';
}

export interface StoredAuthSession {
  token: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: unknown | null;
}

export interface StorageMetadata {
  version: number;
  createdAt: string;
  updatedAt: string;
  credentialCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'web3sl_passkey_';
const CREDENTIALS_KEY = 'credentials';
const WALLET_DATA_KEY = 'wallet_data';
const METADATA_KEY = 'metadata';
const SESSION_KEY = 'auth_session';
const ENCRYPTION_VERSION = 2;
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_DB_NAME = 'web3sl-credential-keys';
const KEY_DB_VERSION = 1;
const KEY_STORE_NAME = 'keys';
const MASTER_KEY_ID = 'master';
export const SESSION_STORAGE_EVENT = 'web3sl:session-storage';

let masterKeyPromise: Promise<CryptoKey> | null = null;
let cachedSession: StoredAuthSession | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === `${STORAGE_PREFIX}${SESSION_KEY}`) {
      cachedSession = null;
    }
  });
}

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

/**
 * Derive an encryption key from a user-provided passphrase.
 */
async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseBuffer = encoder.encode(passphrase);

  // Import the passphrase as key material
  const keyMaterial = await crypto.subtle.importKey('raw', passphraseBuffer, 'PBKDF2', false, [
    'deriveKey',
  ]);

  // Derive an AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

function getMasterKey(): Promise<CryptoKey> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Encrypted credential storage requires IndexedDB.'));
  }
  if (!masterKeyPromise) {
    masterKeyPromise = new Promise<CryptoKey>((resolve, reject) => {
      const request = indexedDB.open(KEY_DB_NAME, KEY_DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(KEY_STORE_NAME)) {
          request.result.createObjectStore(KEY_STORE_NAME);
        }
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Unable to open the credential key store.'));
      request.onsuccess = () => {
        const db = request.result;
        const readTransaction = db.transaction(KEY_STORE_NAME, 'readonly');
        const readRequest = readTransaction.objectStore(KEY_STORE_NAME).get(MASTER_KEY_ID);
        readRequest.onerror = () =>
          reject(readRequest.error ?? new Error('Unable to read the credential key.'));
        readRequest.onsuccess = async () => {
          try {
            if (readRequest.result) {
              resolve(readRequest.result as CryptoKey);
              return;
            }

            const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
              'encrypt',
              'decrypt',
            ]);
            const writeTransaction = db.transaction(KEY_STORE_NAME, 'readwrite');
            writeTransaction.objectStore(KEY_STORE_NAME).put(key, MASTER_KEY_ID);
            writeTransaction.oncomplete = () => resolve(key);
            writeTransaction.onerror = () =>
              reject(writeTransaction.error ?? new Error('Unable to persist the credential key.'));
          } catch (error) {
            reject(error);
          }
        };
      };
    }).catch((error) => {
      masterKeyPromise = null;
      throw error;
    });
  }
  return masterKeyPromise;
}

// ---------------------------------------------------------------------------
// Encryption / Decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt data using AES-256-GCM.
 */
async function encrypt(data: unknown, passphrase?: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(data);
  const dataBuffer = encoder.encode(jsonString);

  // Generate random salt and IV
  const salt = passphrase ? crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) : new Uint8Array();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = passphrase ? await deriveKey(passphrase, salt) : await getMasterKey();

  // Encrypt the data
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    dataBuffer
  );

  // Convert to base64 for storage
  return {
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    data: bufferToBase64(new Uint8Array(encryptedBuffer)),
    version: ENCRYPTION_VERSION,
    keyType: passphrase ? 'passphrase' : 'device',
  };
}

/**
 * Decrypt data using AES-256-GCM.
 */
async function decrypt<T>(encryptedData: EncryptedData, passphrase?: string): Promise<T> {
  if (
    !encryptedData ||
    encryptedData.version !== ENCRYPTION_VERSION ||
    typeof encryptedData.iv !== 'string' ||
    typeof encryptedData.salt !== 'string' ||
    typeof encryptedData.data !== 'string' ||
    (encryptedData.keyType !== 'device' && encryptedData.keyType !== 'passphrase')
  ) {
    throw new Error('Unsupported or invalid encrypted payload.');
  }
  if (encryptedData.keyType === 'passphrase' && !passphrase) {
    throw new Error('A passphrase is required to decrypt this payload.');
  }

  const iv = base64ToBuffer(encryptedData.iv);
  const salt = base64ToBuffer(encryptedData.salt);
  const data = base64ToBuffer(encryptedData.data);
  const key =
    encryptedData.keyType === 'passphrase'
      ? await deriveKey(passphrase!, salt)
      : await getMasterKey();
  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decryptedBuffer)) as T;
}

function isStoredAuthSession(value: unknown): value is StoredAuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<StoredAuthSession>;
  return (
    (session.token === null || typeof session.token === 'string') &&
    (session.accessToken === null || typeof session.accessToken === 'string') &&
    (session.refreshToken === null || typeof session.refreshToken === 'string') &&
    'user' in session
  );
}

export async function storeEncryptedSession(session: Partial<StoredAuthSession>): Promise<void> {
  const normalized: StoredAuthSession = {
    token: session.token ?? session.accessToken ?? null,
    accessToken: session.accessToken ?? session.token ?? null,
    refreshToken: session.refreshToken ?? null,
    user: session.user ?? null,
  };
  const encrypted = await encrypt(normalized);
  localStorage.setItem(`${STORAGE_PREFIX}${SESSION_KEY}`, JSON.stringify(encrypted));
  cachedSession = normalized;
  clearLegacySession();
  window.dispatchEvent(new Event(SESSION_STORAGE_EVENT));
}

export async function getStoredSession(): Promise<StoredAuthSession | null> {
  const key = `${STORAGE_PREFIX}${SESSION_KEY}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    const session = await decrypt<unknown>(JSON.parse(stored));
    if (!isStoredAuthSession(session)) {
      throw new Error('Invalid encrypted session contents.');
    }
    cachedSession = session;
    return session;
  } catch (error) {
    console.error('Failed to decrypt stored session; clearing encrypted session data:', error);
    clearSessionStorage();
    return null;
  }
}

export async function getStoredSessionToken(): Promise<string | null> {
  const session = cachedSession ?? (await getStoredSession()) ?? (await migrateLegacySession());
  return session?.token ?? session?.accessToken ?? null;
}

export async function migrateLegacySession(): Promise<StoredAuthSession | null> {
  const encryptedSession = localStorage.getItem(`${STORAGE_PREFIX}${SESSION_KEY}`);
  if (encryptedSession) {
    const session = await getStoredSession();
    clearLegacySession();
    return session;
  }

  const token =
    localStorage.getItem('token') ??
    localStorage.getItem('accessToken') ??
    localStorage.getItem('auth_token');
  const refreshToken = localStorage.getItem('refreshToken');
  const rawUser = localStorage.getItem('user');
  let user: unknown = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch (error) {
      console.error('Failed to parse legacy session user; clearing legacy session data:', error);
      clearSessionStorage();
      return null;
    }
  }

  if (!token && !refreshToken && !user) {
    clearLegacySession();
    return null;
  }

  try {
    await storeEncryptedSession({ token, accessToken: token, refreshToken, user });
    return cachedSession;
  } catch (error) {
    clearSessionStorage();
    throw error;
  }
}

export function clearSessionStorage(): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${SESSION_KEY}`);
  clearLegacySession();
  cachedSession = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_STORAGE_EVENT));
  }
}

function clearLegacySession(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('auth_token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

// ---------------------------------------------------------------------------
// Storage Operations
// ---------------------------------------------------------------------------

/**
 * Store encrypted credentials locally.
 */
export async function storeCredentials(
  credentials: StoredCredential[],
  passphrase?: string
): Promise<void> {
  const encrypted = await encrypt(credentials, passphrase);
  localStorage.setItem(`${STORAGE_PREFIX}${CREDENTIALS_KEY}`, JSON.stringify(encrypted));
  updateMetadata(credentials.length);
}

/**
 * Retrieve and decrypt stored credentials.
 */
export async function getStoredCredentials(passphrase?: string): Promise<StoredCredential[]> {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${CREDENTIALS_KEY}`);
  if (!stored) return [];

  try {
    const encrypted: EncryptedData = JSON.parse(stored);
    return await decrypt<StoredCredential[]>(encrypted, passphrase);
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
    clearAllStoredData();
    return [];
  }
}

/**
 * Store encrypted wallet data locally.
 */
export async function storeWalletData(
  walletData: StoredWalletData,
  passphrase?: string
): Promise<void> {
  const encrypted = await encrypt(walletData, passphrase);
  localStorage.setItem(`${STORAGE_PREFIX}${WALLET_DATA_KEY}`, JSON.stringify(encrypted));
}

/**
 * Retrieve and decrypt stored wallet data.
 */
export async function getStoredWalletData(passphrase?: string): Promise<StoredWalletData | null> {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${WALLET_DATA_KEY}`);
  if (!stored) return null;

  try {
    const encrypted: EncryptedData = JSON.parse(stored);
    return await decrypt<StoredWalletData>(encrypted, passphrase);
  } catch (error) {
    console.error('Failed to decrypt wallet data:', error);
    clearAllStoredData();
    return null;
  }
}

/**
 * Add a credential to the stored list.
 */
export async function addCredential(
  credential: StoredCredential,
  passphrase?: string
): Promise<void> {
  const existing = await getStoredCredentials(passphrase);
  existing.push(credential);
  await storeCredentials(existing, passphrase);
}

/**
 * Remove a credential from storage.
 */
export async function removeCredential(credentialId: string, passphrase?: string): Promise<void> {
  const existing = await getStoredCredentials(passphrase);
  const filtered = existing.filter((c) => c.credentialId !== credentialId);
  await storeCredentials(filtered, passphrase);
}

/**
 * Update a credential's sign count.
 */
export async function updateCredentialSignCount(
  credentialId: string,
  signCount: number,
  passphrase?: string
): Promise<void> {
  const existing = await getStoredCredentials(passphrase);
  const credential = existing.find((c) => c.credentialId === credentialId);
  if (credential) {
    credential.signCount = signCount;
    credential.lastUsedAt = new Date().toISOString();
    await storeCredentials(existing, passphrase);
  }
}

/**
 * Merge fields into a stored credential (e.g. rename, cache derived account).
 * Returns the updated credential, or `undefined` when it does not exist.
 */
export async function updateStoredCredential(
  credentialId: string,
  patch: Partial<Omit<StoredCredential, 'id' | 'credentialId'>>,
  passphrase?: string
): Promise<StoredCredential | undefined> {
  const existing = await getStoredCredentials(passphrase);
  const index = existing.findIndex((c) => c.credentialId === credentialId);
  if (index === -1) return undefined;
  const updated = { ...existing[index], ...patch };
  existing[index] = updated;
  await storeCredentials(existing, passphrase);
  return updated;
}

/**
 * Rename a stored credential.
 */
export async function renameCredential(
  credentialId: string,
  nickname: string,
  passphrase?: string
): Promise<StoredCredential | undefined> {
  return updateStoredCredential(credentialId, { nickname: nickname.trim() }, passphrase);
}

/**
 * Get a specific credential by ID.
 */
export async function getCredentialById(
  credentialId: string,
  passphrase?: string
): Promise<StoredCredential | undefined> {
  const credentials = await getStoredCredentials(passphrase);
  return credentials.find((c) => c.credentialId === credentialId);
}

/**
 * Clear all stored data.
 */
export function clearAllStoredData(): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${CREDENTIALS_KEY}`);
  localStorage.removeItem(`${STORAGE_PREFIX}${WALLET_DATA_KEY}`);
  localStorage.removeItem(`${STORAGE_PREFIX}${METADATA_KEY}`);
  clearSessionStorage();
}

/**
 * Get storage metadata.
 */
export function getStorageMetadata(): StorageMetadata | null {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${METADATA_KEY}`);
  if (!stored) return null;
  return JSON.parse(stored);
}

/**
 * Update storage metadata.
 */
function updateMetadata(credentialCount: number): void {
  const existing = getStorageMetadata();
  const metadata: StorageMetadata = {
    version: ENCRYPTION_VERSION,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    credentialCount,
  };
  localStorage.setItem(`${STORAGE_PREFIX}${METADATA_KEY}`, JSON.stringify(metadata));
}

/**
 * Check if any credentials are stored.
 */
export function hasStoredCredentials(): boolean {
  return localStorage.getItem(`${STORAGE_PREFIX}${CREDENTIALS_KEY}`) !== null;
}

/**
 * Export encrypted credentials for backup.
 * The user should keep this backup secure.
 */
export async function exportCredentials(passphrase?: string): Promise<string> {
  const credentials = await getStoredCredentials(passphrase);
  const walletData = await getStoredWalletData(passphrase);

  const exportData = {
    credentials,
    walletData,
    exportedAt: new Date().toISOString(),
    version: ENCRYPTION_VERSION,
  };

  return JSON.stringify(exportData);
}

/**
 * Import encrypted credentials from backup.
 */
export async function importCredentials(exportJson: string, passphrase?: string): Promise<boolean> {
  try {
    const exportData = JSON.parse(exportJson);

    if (exportData.credentials) {
      await storeCredentials(exportData.credentials, passphrase);
    }

    if (exportData.walletData) {
      await storeWalletData(exportData.walletData, passphrase);
    }

    return true;
  } catch (error) {
    console.error('Failed to import credentials:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}
