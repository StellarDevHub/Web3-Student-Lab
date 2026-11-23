export interface StepDetail {
  label: string;
  value: string;
}

export interface VisualizerStep {
  label: string;
  description: string;
  details: StepDetail[];
}

export interface VisualizerResult {
  output: string;
  steps: VisualizerStep[];
}

export interface CryptoOperationDef {
  id: string;
  name: string;
  description: string;
  category: 'hash' | 'symmetric' | 'asymmetric' | 'mac' | 'signature';
  icon: string;
  requiresKey?: boolean;
}

export const OPERATIONS: CryptoOperationDef[] = [
  { id: 'hash', name: 'SHA-256 Hash', description: 'One-way cryptographic hash function that produces a fixed 256-bit digest', category: 'hash', icon: '#' },
  { id: 'symmetric', name: 'AES-256-GCM', description: 'Symmetric encryption using a shared secret key', category: 'symmetric', icon: '🔑' },
  { id: 'asymmetric', name: 'RSA-2048 OAEP', description: 'Asymmetric encryption with public/private key pair', category: 'asymmetric', icon: '🔐' },
  { id: 'hmac', name: 'HMAC-SHA256', description: 'Keyed-hash message authentication code', category: 'mac', icon: '🛡️', requiresKey: true },
  { id: 'ecdsa', name: 'ECDSA P-256', description: 'Elliptic Curve Digital Signature Algorithm', category: 'signature', icon: '✍️' },
];

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getSubtle(): SubtleCrypto {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Web Crypto API is not available');
  }
  return window.crypto.subtle;
}

export async function visualizeHash(input: string): Promise<VisualizerResult> {
  const subtle = getSubtle();
  const steps: VisualizerStep[] = [];

  const encoded = textEncoder.encode(input);
  steps.push({
    label: 'Step 1: Encode Input',
    description: 'Convert the input string to UTF-8 bytes for processing',
    details: [
      { label: 'Input Text', value: input },
      { label: 'Byte Length', value: `${encoded.byteLength} bytes` },
      {
        label: 'Bytes (Hex)',
        value:
          toHex(encoded.buffer.slice(0, Math.min(32, encoded.byteLength))) +
          (encoded.byteLength > 32 ? '...' : ''),
      },
    ],
  });

  const digest = await subtle.digest('SHA-256', encoded);
  const hashHex = toHex(digest);

  steps.push({
    label: 'Step 2: Compute SHA-256',
    description: 'SHA-256 produces a fixed 256-bit (32-byte) hash - always the same length regardless of input',
    details: [
      { label: 'Digest (Hex)', value: hashHex },
      { label: 'Digest (Base64)', value: toBase64(digest) },
      { label: 'Digest Length', value: `${digest.byteLength * 8} bits (${digest.byteLength} bytes)` },
    ],
  });

  return { output: hashHex, steps };
}

export async function visualizeSymmetricEncrypt(input: string): Promise<VisualizerResult> {
  const subtle = getSubtle();
  const steps: VisualizerStep[] = [];

  const key = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const keyRaw = await subtle.exportKey('raw', key);
  const keyHex = toHex(keyRaw);

  steps.push({
    label: 'Step 1: Generate AES-256 Key',
    description: 'A random 256-bit symmetric key is generated. This key must be shared between sender and recipient.',
    details: [
      { label: 'Algorithm', value: 'AES-256-GCM' },
      { label: 'Key (Hex)', value: keyHex },
      { label: 'Key Length', value: '256 bits (32 bytes)' },
    ],
  });

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ivHex = toHex(iv.buffer);

  steps.push({
    label: 'Step 2: Generate Initialization Vector (IV)',
    description: 'A random 12-byte IV/nonce ensures the same plaintext produces different ciphertext each time',
    details: [
      { label: 'IV (Hex)', value: ivHex },
      { label: 'IV Length', value: '96 bits (12 bytes)' },
    ],
  });

  const plaintext = textEncoder.encode(input);
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    plaintext
  );

  steps.push({
    label: 'Step 3: Encrypt Plaintext',
    description: 'AES-256-GCM encrypts the data and appends a 128-bit authentication tag for integrity verification',
    details: [
      { label: 'Plaintext', value: input },
      { label: 'Ciphertext (Hex)', value: toHex(encrypted) },
      { label: 'Ciphertext (Base64)', value: toBase64(encrypted) },
      { label: 'Ciphertext Length', value: `${encrypted.byteLength} bytes` },
    ],
  });

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encrypted
  );
  const decryptedText = textDecoder.decode(decrypted);

  steps.push({
    label: 'Step 4: Decrypt & Verify',
    description: 'Decrypting with the same key and IV recovers the original plaintext',
    details: [
      { label: 'Decrypted Text', value: decryptedText },
      { label: 'Verification', value: decryptedText === input ? 'PASS - Plaintext matches' : 'FAIL - Data corrupted' },
    ],
  });

  return { output: toHex(encrypted), steps };
}

export async function visualizeRSAEncrypt(input: string): Promise<VisualizerResult> {
  const subtle = getSubtle();
  const steps: VisualizerStep[] = [];

  const keyPair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const publicModulus = publicJwk.n || '';

  steps.push({
    label: 'Step 1: Generate RSA-2048 Key Pair',
    description: 'A 2048-bit RSA key pair is generated. The public key encrypts, the private key decrypts.',
    details: [
      { label: 'Algorithm', value: 'RSA-OAEP-2048 SHA-256' },
      { label: 'Public Key (n modulus)', value: `0x${publicModulus.slice(0, 40)}...` },
      {
        label: 'Key Fingerprint',
        value: toHex(await subtle.digest('SHA-256', textEncoder.encode(publicModulus))).slice(0, 16),
      },
      { label: 'Modulus Length', value: '2048 bits (256 bytes)' },
    ],
  });

  const plaintext = textEncoder.encode(input);
  const encrypted = await subtle.encrypt(
    { name: 'RSA-OAEP' },
    keyPair.publicKey,
    plaintext
  );

  steps.push({
    label: 'Step 2: Encrypt with Public Key',
    description: 'Data encrypted with the public key can only be decrypted with the corresponding private key',
    details: [
      { label: 'Plaintext', value: input },
      { label: 'Ciphertext (Hex)', value: toHex(encrypted) },
      { label: 'Ciphertext (Base64)', value: toBase64(encrypted) },
      { label: 'Ciphertext Length', value: `${encrypted.byteLength} bytes` },
    ],
  });

  const decrypted = await subtle.decrypt(
    { name: 'RSA-OAEP' },
    keyPair.privateKey,
    encrypted
  );
  const decryptedText = textDecoder.decode(decrypted);

  steps.push({
    label: 'Step 3: Decrypt with Private Key',
    description: 'Only the holder of the private key can decrypt the ciphertext',
    details: [
      { label: 'Decrypted Text', value: decryptedText },
      { label: 'Verification', value: decryptedText === input ? 'PASS - Plaintext matches' : 'FAIL - Data corrupted' },
    ],
  });

  return { output: toHex(encrypted), steps };
}

export async function visualizeHMAC(key: string, message: string): Promise<VisualizerResult> {
  const subtle = getSubtle();
  const steps: VisualizerStep[] = [];

  const keyBytes = textEncoder.encode(key);
  const hmacKey = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );

  steps.push({
    label: 'Step 1: Import HMAC Key',
    description: 'The secret key is imported into the HMAC-SHA256 algorithm',
    details: [
      { label: 'Secret Key', value: key },
      { label: 'Key (Hex)', value: toHex(keyBytes) },
      { label: 'Key Length', value: `${keyBytes.byteLength} bytes` },
    ],
  });

  const signature = await subtle.sign('HMAC', hmacKey, textEncoder.encode(message));
  const sigHex = toHex(signature);

  steps.push({
    label: 'Step 2: Compute HMAC',
    description: 'HMAC-SHA256 produces a fixed 256-bit authentication tag',
    details: [
      { label: 'Message', value: message },
      { label: 'HMAC (Hex)', value: sigHex },
      { label: 'HMAC (Base64)', value: toBase64(signature) },
      { label: 'HMAC Length', value: `${signature.byteLength * 8} bits (${signature.byteLength} bytes)` },
    ],
  });

  const valid = await subtle.verify('HMAC', hmacKey, signature, textEncoder.encode(message));

  steps.push({
    label: 'Step 3: Verify HMAC',
    description: 'Verification ensures the message integrity and authenticity',
    details: [
      { label: 'Verification', value: valid ? 'PASS - Message is authentic and untampered' : 'FAIL - Message was modified' },
    ],
  });

  return { output: sigHex, steps };
}

export async function visualizeECDSASign(message: string): Promise<VisualizerResult> {
  const subtle = getSubtle();
  const steps: VisualizerStep[] = [];

  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);

  steps.push({
    label: 'Step 1: Generate ECDSA Key Pair',
    description: 'A P-256 (secp256r1) elliptic curve key pair is generated',
    details: [
      { label: 'Algorithm', value: 'ECDSA P-256 (secp256r1)' },
      { label: 'Public Key (x)', value: `0x${(publicJwk.x || '').slice(0, 32)}...` },
      { label: 'Public Key (y)', value: `0x${(publicJwk.y || '').slice(0, 32)}...` },
      { label: 'Curve', value: 'P-256 (secp256r1)' },
    ],
  });

  const msgBytes = textEncoder.encode(message);
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    msgBytes
  );
  const sigHex = toHex(signature);

  steps.push({
    label: 'Step 2: Sign Message',
    description: 'The private key signs the SHA-256 hash of the message, producing a unique signature',
    details: [
      { label: 'Message', value: message },
      { label: 'Signature (Hex)', value: sigHex },
      { label: 'Signature (Base64)', value: toBase64(signature) },
      { label: 'Signature Length', value: `${signature.byteLength * 8} bits (${signature.byteLength} bytes)` },
    ],
  });

  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.publicKey,
    signature,
    msgBytes
  );

  steps.push({
    label: 'Step 3: Verify Signature',
    description: 'The public key verifies the signature without revealing the private key',
    details: [
      { label: 'Verification', value: valid ? 'PASS - Signature is valid and message is authentic' : 'FAIL - Signature is invalid' },
    ],
  });

  return { output: sigHex, steps };
}
