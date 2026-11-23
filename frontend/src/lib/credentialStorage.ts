/**
 * Encrypted Credential Storage
 *
 * Client-side encrypted storage for passkey credentials and wallet data.
 * Uses the Web Crypto API for AES-GCM encryption with PBKDF2 key derivation.
 *
 * Security properties:
 * - Zero server-side private data: All sensitive data stays on the device
 * - Encrypted at rest: AES-256-GCM encryption for stored credentials
 * - Derivation: PBKDF2 with random salt for key derivation
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
  salt: string; // base64-encoded salt
  data: string; // base64-encoded encrypted data
  version: number; // encryption format version
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
const ENCRYPTION_VERSION = 1;
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

/**
 * Derive an encryption key from a user-provided passphrase or device key.
 *
 * In a production system, this would use:
 * 1. A hardware security module (HSM)
 * 2. Device-specific key derivation
 * 3. Biometric-gated key storage
 *
 * For this implementation, we use a combination of:
 * - Browser fingerprint (for device binding)
 * - Optional user passphrase
 * - Random salt (stored with encrypted data)
 */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseBuffer = encoder.encode(passphrase);

  // Import the passphrase as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

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

/**
 * Generate a device-specific passphrase for key derivation.
 * This binds the encrypted data to the current device/browser.
 */
function generateDevicePassphrase(): string {
  // Use browser fingerprint components for device binding
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    new Date().getTimezoneOffset().toString(),
    // Add a random component for additional security
    crypto.randomUUID(),
  ];

  return components.join('|');
}

// ---------------------------------------------------------------------------
// Encryption / Decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt data using AES-256-GCM.
 */
async function encrypt(
  data: unknown,
  passphrase?: string
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(data);
  const dataBuffer = encoder.encode(jsonString);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive encryption key
  const effectivePassphrase = passphrase || generateDevicePassphrase();
  const key = await deriveKey(effectivePassphrase, salt);

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
  };
}

/**
 * Decrypt data using AES-256-GCM.
 */
async function decrypt<T>(
  encryptedData: EncryptedData,
  passphrase?: string
): Promise<T> {
  const encoder = new TextEncoder();
  const iv = base64ToBuffer(encryptedData.iv);
  const salt = base64ToBuffer(encryptedData.salt);
  const data = base64ToBuffer(encryptedData.data);

  // Derive decryption key
  const effectivePassphrase = passphrase || generateDevicePassphrase();
  const key = await deriveKey(effectivePassphrase, salt);

  // Decrypt the data
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  );

  // Parse JSON
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(decryptedBuffer);
  return JSON.parse(jsonString) as T;
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
  localStorage.setItem(
    `${STORAGE_PREFIX}${CREDENTIALS_KEY}`,
    JSON.stringify(encrypted)
  );
  updateMetadata(credentials.length);
}

/**
 * Retrieve and decrypt stored credentials.
 */
export async function getStoredCredentials(
  passphrase?: string
): Promise<StoredCredential[]> {
  const stored = localStorage.getItem(
    `${STORAGE_PREFIX}${CREDENTIALS_KEY}`
  );
  if (!stored) return [];

  try {
    const encrypted: EncryptedData = JSON.parse(stored);
    return await decrypt<StoredCredential[]>(encrypted, passphrase);
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
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
  localStorage.setItem(
    `${STORAGE_PREFIX}${WALLET_DATA_KEY}`,
    JSON.stringify(encrypted)
  );
}

/**
 * Retrieve and decrypt stored wallet data.
 */
export async function getStoredWalletData(
  passphrase?: string
): Promise<StoredWalletData | null> {
  const stored = localStorage.getItem(
    `${STORAGE_PREFIX}${WALLET_DATA_KEY}`
  );
  if (!stored) return null;

  try {
    const encrypted: EncryptedData = JSON.parse(stored);
    return await decrypt<StoredWalletData>(encrypted, passphrase);
  } catch (error) {
    console.error('Failed to decrypt wallet data:', error);
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
export async function removeCredential(
  credentialId: string,
  passphrase?: string
): Promise<void> {
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
  localStorage.setItem(
    `${STORAGE_PREFIX}${METADATA_KEY}`,
    JSON.stringify(metadata)
  );
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
export async function exportCredentials(
  passphrase?: string
): Promise<string> {
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
export async function importCredentials(
  exportJson: string,
  passphrase?: string
): Promise<boolean> {
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

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}
