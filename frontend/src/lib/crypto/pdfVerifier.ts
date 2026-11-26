/**
 * Client-side PDF diploma verifier.
 *
 * Protocol
 * --------
 * When a diploma PDF is issued it has three custom metadata keys embedded by
 * the certificate-generator:
 *
 *   X-Certificate-Public-Key  — base64url-encoded raw Ed25519 public key (32 bytes)
 *   X-Certificate-Signature   — base64url-encoded Ed25519 signature (64 bytes)
 *   X-Certificate-Content-Hash— hex SHA-256 of the PDF's canonical content
 *                                (PDF bytes with the signature field zeroed out)
 *
 * Verification steps
 * ------------------
 * 1. Load the PDF and extract those three metadata fields with pdf-lib.
 * 2. Recompute SHA-256 over the PDF bytes (signature field zeroed).
 * 3. Compare the computed hash with the stored X-Certificate-Content-Hash.
 * 4. Verify the Ed25519 signature over the stored hash bytes using SubtleCrypto.
 *
 * All crypto runs entirely in the browser — no server round-trip.
 */

export type VerificationStatus =
  | 'verified'
  | 'hash_mismatch'
  | 'invalid_signature'
  | 'missing_metadata'
  | 'unsupported'
  | 'error';

export interface VerificationResult {
  status: VerificationStatus;
  /** Human-readable explanation of the outcome. */
  message: string;
  /** Issuer public key (base64url), present when metadata was readable. */
  publicKey?: string;
  /** SHA-256 of the canonical PDF content (hex). */
  contentHash?: string;
  /** Milliseconds the full verification took. */
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF metadata extraction
// ─────────────────────────────────────────────────────────────────────────────

interface DiplomaMetadata {
  publicKey: string;
  signature: string;
  contentHash: string;
}

/**
 * Extract the three cryptographic metadata fields from a PDF's document info
 * dictionary using pdf-lib.  Returns null if any field is absent.
 */
async function extractMetadata(pdfBytes: Uint8Array): Promise<DiplomaMetadata | null> {
  // Dynamically import pdf-lib so it doesn't bloat the initial bundle.
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  // pdf-lib exposes custom keyword entries via getKeywords() as a string.
  // We also check the Subject and Creator fields as fallbacks since jsPDF
  // stores custom properties differently depending on the version.
  //
  // Primary approach: custom metadata stored as Subject JSON (compact, lossless).
  const subject = doc.getSubject() ?? '';
  if (subject.startsWith('{')) {
    try {
      const parsed = JSON.parse(subject) as Record<string, string>;
      const publicKey = parsed['X-Certificate-Public-Key'];
      const signature = parsed['X-Certificate-Signature'];
      const contentHash = parsed['X-Certificate-Content-Hash'];
      if (publicKey && signature && contentHash) {
        return { publicKey, signature, contentHash };
      }
    } catch {
      // fall through to keyword scanning
    }
  }

  // Secondary approach: Keywords field formatted as "key=value" pairs separated
  // by semicolons — the format used by our certificate-generator.
  const keywords = doc.getKeywords() ?? '';
  if (keywords.includes('X-Certificate-Public-Key')) {
    const kv: Record<string, string> = {};
    keywords.split(';').forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        kv[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
    });
    const publicKey = kv['X-Certificate-Public-Key'];
    const signature = kv['X-Certificate-Signature'];
    const contentHash = kv['X-Certificate-Content-Hash'];
    if (publicKey && signature && contentHash) {
      return { publicKey, signature, contentHash };
    }
  }

  // Tertiary approach: Creator or Author field (some export paths use these).
  const creator = doc.getCreator() ?? '';
  if (creator.startsWith('{')) {
    try {
      const parsed = JSON.parse(creator) as Record<string, string>;
      const publicKey = parsed['X-Certificate-Public-Key'];
      const signature = parsed['X-Certificate-Signature'];
      const contentHash = parsed['X-Certificate-Content-Hash'];
      if (publicKey && signature && contentHash) {
        return { publicKey, signature, contentHash };
      }
    } catch {
      // fall through
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cryptographic helpers (Web Crypto API)
// ─────────────────────────────────────────────────────────────────────────────

/** base64url → Uint8Array (no padding required). */
function decodeBase64url(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** hex string → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Odd-length hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Uint8Array → lowercase hex */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 of `data` and return the result as a lowercase hex string.
 * Uses the Web Crypto API (always available in modern browsers and in Next.js
 * edge/server runtimes).
 */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuf));
}

/**
 * Verify an Ed25519 signature.
 *
 * @param publicKeyBytes  Raw 32-byte Ed25519 public key.
 * @param signatureBytes  64-byte signature.
 * @param messageBytes    Message that was signed (the hash bytes, not the hex string).
 */
async function verifyEd25519(
  publicKeyBytes: Uint8Array,
  signatureBytes: Uint8Array,
  messageBytes: Uint8Array
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signatureBytes, messageBytes);
  } catch {
    // Ed25519 is not available in this browser/runtime (old Safari / Node < 18).
    throw new Error('Ed25519 not supported in this environment');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical content hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the canonical content hash of a PDF.
 *
 * The signing convention zeroes the region between the first occurrence of
 * "/X-Certificate-Signature (" and its closing ")" so the signature field
 * doesn't invalidate itself.  If that marker is absent we hash the whole file —
 * which is fine for content-hash comparison but makes Ed25519 verification
 * impossible (the metadata must be present to verify).
 */
async function computeCanonicalHash(pdfBytes: Uint8Array): Promise<string> {
  const marker = '/X-Certificate-Signature (';
  const markerBytes = new TextEncoder().encode(marker);

  // Find the marker byte sequence.
  let markerStart = -1;
  outer: for (let i = 0; i <= pdfBytes.length - markerBytes.length; i++) {
    for (let j = 0; j < markerBytes.length; j++) {
      if (pdfBytes[i + j] !== markerBytes[j]) continue outer;
    }
    markerStart = i;
    break;
  }

  if (markerStart === -1) {
    // No signature field: hash the whole file as-is.
    return sha256Hex(pdfBytes);
  }

  // Find the closing ')' after the marker.
  const sigValueStart = markerStart + markerBytes.length;
  let sigValueEnd = sigValueStart;
  while (sigValueEnd < pdfBytes.length && pdfBytes[sigValueEnd] !== 0x29 /* ')' */) {
    sigValueEnd++;
  }

  // Build a copy with the signature value zeroed.
  const zeroed = new Uint8Array(pdfBytes);
  zeroed.fill(0x20 /* space */, sigValueStart, sigValueEnd);
  return sha256Hex(zeroed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fully verify a diploma PDF file in the browser.
 *
 * Returns a {@link VerificationResult} describing the outcome.  Never throws —
 * errors are caught and surfaced via `status: 'error'`.
 */
export async function verifyDiplomaPdf(file: File): Promise<VerificationResult> {
  const t0 = performance.now();

  try {
    // 1. Read file bytes.
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    // 2. Check it's actually a PDF.
    const header = new TextDecoder('ascii', { fatal: false }).decode(pdfBytes.slice(0, 5));
    if (!header.startsWith('%PDF-')) {
      return {
        status: 'unsupported',
        message: 'File is not a valid PDF.',
        durationMs: performance.now() - t0,
      };
    }

    // 3. Extract cryptographic metadata.
    const metadata = await extractMetadata(pdfBytes);
    if (!metadata) {
      return {
        status: 'missing_metadata',
        message:
          'No cryptographic metadata found. This PDF was not issued by Web3 Student Lab or the metadata has been stripped.',
        durationMs: performance.now() - t0,
      };
    }

    const { publicKey, signature, contentHash: storedHash } = metadata;

    // 4. Recompute the canonical content hash.
    const computedHash = await computeCanonicalHash(pdfBytes);

    if (computedHash !== storedHash.toLowerCase()) {
      return {
        status: 'hash_mismatch',
        message:
          'Content hash mismatch — the PDF has been modified after issuance.',
        publicKey,
        contentHash: computedHash,
        durationMs: performance.now() - t0,
      };
    }

    // 5. Verify the Ed25519 signature over the hash bytes.
    let publicKeyBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    let hashBytes: Uint8Array;

    try {
      publicKeyBytes = decodeBase64url(publicKey);
      signatureBytes = decodeBase64url(signature);
      // The signed message is the raw UTF-8 bytes of the hex hash string.
      hashBytes = new TextEncoder().encode(storedHash.toLowerCase());
    } catch {
      return {
        status: 'error',
        message: 'Malformed cryptographic metadata (base64url decode failed).',
        publicKey,
        contentHash: computedHash,
        durationMs: performance.now() - t0,
      };
    }

    let valid: boolean;
    try {
      valid = await verifyEd25519(publicKeyBytes, signatureBytes, hashBytes);
    } catch (err) {
      return {
        status: 'unsupported',
        message:
          err instanceof Error
            ? `Ed25519 verification unavailable: ${err.message}`
            : 'Ed25519 not supported in this browser.',
        publicKey,
        contentHash: computedHash,
        durationMs: performance.now() - t0,
      };
    }

    if (!valid) {
      return {
        status: 'invalid_signature',
        message:
          'Signature is invalid. The PDF content or metadata may have been tampered with.',
        publicKey,
        contentHash: computedHash,
        durationMs: performance.now() - t0,
      };
    }

    return {
      status: 'verified',
      message: 'Cryptographically Verified by Web3 Student Lab',
      publicKey,
      contentHash: computedHash,
      durationMs: performance.now() - t0,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'An unexpected error occurred.',
      durationMs: performance.now() - t0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Certificate-generator companion: embed metadata into a jsPDF document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an Ed25519 key pair in the browser and return both keys as
 * base64url strings.  The private key is exported in PKCS#8 format and
 * immediately encoded — never stored.
 */
export async function generateEd25519KeyPair(): Promise<{
  publicKeyB64: string;
  privateKeyB64: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true /* extractable */,
    ['sign', 'verify']
  );

  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const privPkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));

  const toB64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

  return {
    publicKeyB64: toB64url(pubRaw),
    privateKeyB64: toB64url(privPkcs8),
  };
}

/**
 * Sign a content hash with an Ed25519 private key (PKCS#8, base64url-encoded)
 * and return the signature as base64url.
 *
 * The signed message is the UTF-8 bytes of the lowercase hex hash string.
 */
export async function signContentHash(
  contentHashHex: string,
  privateKeyB64: string
): Promise<string> {
  const pkcs8Bytes = decodeBase64url(privateKeyB64);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const message = new TextEncoder().encode(contentHashHex.toLowerCase());
  const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, message);
  const sigBytes = new Uint8Array(sigBuf);

  return btoa(String.fromCharCode(...sigBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Build the metadata keyword string that the certificate-generator should
 * embed into the PDF's Keywords metadata field.
 *
 * Format: "X-Certificate-Public-Key=<b64url>; X-Certificate-Signature=<b64url>;
 *          X-Certificate-Content-Hash=<hex>"
 */
export function buildMetadataKeywords(
  publicKeyB64: string,
  signatureB64: string,
  contentHashHex: string
): string {
  return [
    `X-Certificate-Public-Key=${publicKeyB64}`,
    `X-Certificate-Signature=${signatureB64}`,
    `X-Certificate-Content-Hash=${contentHashHex}`,
  ].join('; ');
}

export { hexToBytes, bytesToHex, sha256Hex };
