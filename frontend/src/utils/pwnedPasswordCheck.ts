export interface PwnedCheckResult {
  isBreached: boolean;
  count: number;
  error: string | null;
}

/**
 * Computes SHA-1 hash of a string using Web Crypto API or Node crypto fallback.
 */
export async function sha1Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // Fallback for Node test environments
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha1').update(message).digest('hex').toUpperCase();
  } catch {
    throw new Error('Cryptographic SHA-1 digest unavailable in environment.');
  }
}

/**
 * Checks HaveIBeenPwned API via k-Anonymity (first 5 SHA-1 characters).
 * Guarantees raw passwords and full hashes are never transmitted across the network.
 */
export async function checkPasswordBreached(password: string): Promise<PwnedCheckResult> {
  if (!password) {
    return { isBreached: false, count: 0, error: null };
  }

  try {
    const sha1 = await sha1Hex(password);
    const prefix = sha1.substring(0, 5);
    const suffix = sha1.substring(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: {
        'Add-Padding': 'true',
      },
    });

    if (!response.ok) {
      return { isBreached: false, count: 0, error: `HIBP API returned status ${response.status}` };
    }

    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
        const count = parseInt(countStr, 10) || 1;
        return {
          isBreached: true,
          count,
          error: null,
        };
      }
    }

    return { isBreached: false, count: 0, error: null };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Breach verification unavailable';
    return {
      isBreached: false,
      count: 0,
      error: errorMsg,
    };
  }
}
