import { API_BASE_URL, getWorkspaceId } from './api-config';

/**
 * Utility for End-to-End Payload Encryption
 */

export interface EncryptedPayload {
  keyId: string;
  encryptedData: string;
}

/**
 * Fetches the current public key from the backend
 */
async function fetchPublicKey(): Promise<{ keyId: string; publicKey: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/security/public-key`, {
      headers: {
        'x-workspace-id': getWorkspaceId(),
      },
    });
    const result = await response.json();

    if (result.status === 'success') {
      return result.data;
    }
    throw new Error(result.message || 'Failed to fetch public key');
  } catch (error) {
    console.error('Error fetching public key:', error);
    throw error;
  }
}

/**
 * Converts a PEM public key to an ArrayBuffer
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const binaryString = window.atob(
    pem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s/g, '')
  );
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypts a JSON payload using the rotating public key
 */
export async function encryptPayload(data: any): Promise<EncryptedPayload> {
  const { keyId, publicKey: pemKey } = await fetchPublicKey();

  const keyBuffer = pemToArrayBuffer(pemKey);
  const cryptoKey = await window.crypto.subtle.importKey(
    'spki',
    keyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt']
  );

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(JSON.stringify(data));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    cryptoKey,
    dataBuffer
  );

  // Convert to Base64
  const encryptedData = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));

  return {
    keyId,
    encryptedData,
  };
}
