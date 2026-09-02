/**
 * Passkey/WebAuthn Client Utilities
 *
 * Client-side utilities for WebAuthn registration and authentication.
 * Uses the Web Crypto API and browser's navigator.credentials API
 * to interact with platform authenticators (TouchID, FaceID, Windows Hello).
 *
 * These utilities work with the backend passkey service and Soroban smart contracts
 * to provide a complete passwordless authentication flow.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PasskeyRegistrationOptions {
  userId: string;
  userName: string;
  userDisplayName: string;
}

export interface PasskeyAuthenticationOptions {
  userId?: string;
}

export interface PasskeyCredential {
  id: string;
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  signCount: number;
  deviceName?: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface RegistrationResult {
  success: boolean;
  credentialId?: string;
  publicKeyX?: string;
  publicKeyY?: string;
  error?: string;
}

export interface AuthenticationResult {
  success: boolean;
  credentialId?: string;
  verified?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API request failed: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Request failed');
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Convert a base64url string to a Uint8Array.
 */
function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = base64.padEnd(
    Math.ceil(base64.length / 4) * 4,
    '='
  );
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

/**
 * Convert an ArrayBuffer to a base64url string.
 */
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert a Uint8Array to a hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex string to a Uint8Array.
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Start the passkey registration ceremony.
 *
 * This function:
 * 1. Requests a registration challenge from the server
 * 2. Calls the browser's WebAuthn API to create a credential
 * 3. Sends the credential back to the server for verification
 *
 * @param options - Registration options including user details
 * @returns The registration result
 */
export async function registerPasskey(
  options: PasskeyRegistrationOptions
): Promise<RegistrationResult> {
  try {
    // 1. Check WebAuthn support
    if (!window.PublicKeyCredential) {
      return {
        success: false,
        error: 'WebAuthn is not supported in this browser',
      };
    }

    // 2. Check if platform authenticator is available
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      return {
        success: false,
        error: 'Platform authenticator (biometric) is not available',
      };
    }

    // 3. Get registration challenge from server
    const challengeOptions = await apiRequest<{
      challenge: string;
      rp: { id: string; name: string };
      user: { id: string; name: string; displayName: string };
      pubKeyCredParams: Array<{ alg: number; type: string }>;
      authenticatorSelection: {
        authenticatorAttachment: string;
        userVerification: string;
        residentKey: string;
      };
      timeout: number;
      attestation: string;
      excludeCredentials: Array<{ id: string; type: string }>;
    }>('/passkey/register/challenge', {
      method: 'POST',
      body: JSON.stringify({
        userId: options.userId,
        userName: options.userName,
        userDisplayName: options.userDisplayName,
      }),
    });

    // 4. Create credential using browser's WebAuthn API
    const createOptions: CredentialCreationOptions = {
      publicKey: {
        challenge: base64UrlToBuffer(challengeOptions.challenge),
        rp: challengeOptions.rp,
        user: {
          id: base64UrlToBuffer(challengeOptions.user.id),
          name: challengeOptions.user.name,
          displayName: challengeOptions.user.displayName,
        },
        pubKeyCredParams: challengeOptions.pubKeyCredParams.map((param) => ({
          alg: param.alg,
          type: param.type as 'public-key',
        })),
        authenticatorSelection: {
          authenticatorAttachment:
            challengeOptions.authenticatorSelection.authenticatorAttachment as
              | 'platform'
              | 'cross-platform',
          userVerification:
            challengeOptions.authenticatorSelection.userVerification as
              | 'required'
              | 'preferred'
              | 'discouraged',
          residentKey:
            challengeOptions.authenticatorSelection.residentKey as
              | 'required'
              | 'preferred'
              | 'discouraged',
        },
        timeout: challengeOptions.timeout,
        attestation: challengeOptions.attestation as 'none' | 'indirect' | 'direct',
        excludeCredentials: challengeOptions.excludeCredentials.map((cred) => ({
          id: base64UrlToBuffer(cred.id),
          type: cred.type as 'public-key',
        })),
      },
    };

    const credential = (await navigator.credentials.create(
      createOptions
    )) as PublicKeyCredential | null;

    if (!credential) {
      return {
        success: false,
        error: 'Credential creation was cancelled',
      };
    }

    // 5. Extract credential data
    const response = credential.response as AuthenticatorAttestationResponse;
    const attestationObject = bufferToBase64Url(response.getAttestationObject());
    const clientDataJSON = bufferToBase64Url(response.getClientDataJSON());

    // Extract the public key from the attestation object
    // The public key is embedded in the credential public key
    const publicKeyBuffer = response.getPublicKey();
    if (!publicKeyBuffer) {
      return {
        success: false,
        error: 'Failed to extract public key',
      };
    }

    // Parse the P-256 public key (04 || x || y)
    const publicKeyBytes = new Uint8Array(publicKeyBuffer);
    if (publicKeyBytes[0] !== 0x04 || publicKeyBytes.length !== 65) {
      return {
        success: false,
        error: 'Invalid public key format',
      };
    }

    const publicKeyX = bufferToHex(publicKeyBytes.slice(1, 33).buffer);
    const publicKeyY = bufferToHex(publicKeyBytes.slice(33, 65).buffer);

    // 6. Verify with server
    const result = await apiRequest<{
      credentialId: string;
      publicKeyX: string;
      publicKeyY: string;
      signCount: number;
      deviceName?: string;
    }>('/passkey/register/verify', {
      method: 'POST',
      body: JSON.stringify({
        userId: options.userId,
        challenge: challengeOptions.challenge,
        credentialId: bufferToBase64Url(credential.rawId),
        attestationObject,
        clientDataJSON,
        publicKeyX,
        publicKeyY,
        signCount: 0,
      }),
    });

    return {
      success: true,
      credentialId: result.credentialId,
      publicKeyX: result.publicKeyX,
      publicKeyY: result.publicKeyY,
    };
  } catch (error: any) {
    console.error('Passkey registration error:', error);
    return {
      success: false,
      error: error.message || 'Registration failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Start the passkey authentication ceremony.
 *
 * This function:
 * 1. Requests an authentication challenge from the server
 * 2. Calls the browser's WebAuthn API to get an assertion
 * 3. Sends the assertion back to the server for verification
 *
 * @param options - Authentication options (optional user ID)
 * @returns The authentication result
 */
export async function authenticatePasskey(
  options: PasskeyAuthenticationOptions = {}
): Promise<AuthenticationResult> {
  try {
    // 1. Check WebAuthn support
    if (!window.PublicKeyCredential) {
      return {
        success: false,
        error: 'WebAuthn is not supported in this browser',
      };
    }

    // 2. Get authentication challenge from server
    const challengeOptions = await apiRequest<{
      challenge: string;
      rpId: string;
      allowCredentials: Array<{ id: string; type: string }>;
      userVerification: string;
      timeout: number;
    }>('/passkey/authenticate/challenge', {
      method: 'POST',
      body: JSON.stringify({
        userId: options.userId,
      }),
    });

    // 3. Get assertion using browser's WebAuthn API
    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: base64UrlToBuffer(challengeOptions.challenge),
        rpId: challengeOptions.rpId,
        allowCredentials: challengeOptions.allowCredentials.map((cred) => ({
          id: base64UrlToBuffer(cred.id),
          type: cred.type as 'public-key',
        })),
        userVerification:
          challengeOptions.userVerification as
            | 'required'
            | 'preferred'
            | 'discouraged',
        timeout: challengeOptions.timeout,
      },
    };

    const assertion = (await navigator.credentials.get(
      getOptions
    )) as PublicKeyCredential | null;

    if (!assertion) {
      return {
        success: false,
        error: 'Authentication was cancelled',
      };
    }

    // 4. Extract assertion data
    const response = assertion.response as AuthenticatorAssertionResponse;
    const authenticatorData = bufferToBase64Url(response.authenticatorData);
    const clientDataJSON = bufferToBase64Url(response.clientDataJSON);
    const signature = bufferToBase64Url(response.signature);

    // Get sign count from authenticator data
    const authDataBytes = new Uint8Array(response.authenticatorData);
    const signCount =
      (authDataBytes[33] << 24) |
      (authDataBytes[34] << 16) |
      (authDataBytes[35] << 8) |
      authDataBytes[36];

    // 5. Verify with server
    const result = await apiRequest<{
      verified: boolean;
      credentialId: string;
      signCount: number;
    }>('/passkey/authenticate/verify', {
      method: 'POST',
      body: JSON.stringify({
        challenge: challengeOptions.challenge,
        credentialId: bufferToBase64Url(assertion.rawId),
        authenticatorData,
        clientDataJSON,
        signature,
        signCount,
      }),
    });

    return {
      success: true,
      credentialId: result.credentialId,
      verified: result.verified,
    };
  } catch (error: any) {
    console.error('Passkey authentication error:', error);
    return {
      success: false,
      error: error.message || 'Authentication failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Credential Management
// ---------------------------------------------------------------------------

/**
 * Get all credentials for a user.
 */
export async function getUserCredentials(
  userId: string
): Promise<PasskeyCredential[]> {
  return apiRequest<PasskeyCredential[]>(`/passkey/credentials/${userId}`);
}

/**
 * Get the count of credentials for a user.
 */
export async function getUserCredentialCount(userId: string): Promise<number> {
  const result = await apiRequest<{ count: number }>(
    `/passkey/credentials/${userId}/count`
  );
  return result.count;
}

/**
 * Delete a credential.
 */
export async function deleteCredential(
  credentialId: string
): Promise<boolean> {
  const result = await apiRequest<{ deleted: boolean }>(
    `/passkey/credentials/${credentialId}`,
    { method: 'DELETE' }
  );
  return result.deleted;
}

// ---------------------------------------------------------------------------
// Feature Detection
// ---------------------------------------------------------------------------

/**
 * Check if WebAuthn is supported in the current browser.
 */
export function isWebAuthnSupported(): boolean {
  return !!window.PublicKeyCredential;
}

/**
 * Check if a platform authenticator (biometric) is available.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

/**
 * Get a human-readable name for the authenticator type.
 */
export function getAuthenticatorName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'Touch ID / Face ID';
  if (/Mac/.test(ua)) return 'Touch ID';
  if (/Android/.test(ua)) return 'Fingerprint / Face Unlock';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'Platform Authenticator';
}
