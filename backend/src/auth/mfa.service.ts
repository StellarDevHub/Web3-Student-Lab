import crypto from 'crypto';
import QRCode from 'qrcode';

export interface TotpEnrollment {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TotpValidationResult {
  valid: boolean;
  usedBackupCode?: boolean;
  lockedOut?: boolean;
  lockoutRemainingSec?: number;
}

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a random Base32 encoded secret key for RFC 6238 TOTP
 */
export function generateTotpSecret(length = 20): string {
  const randomBytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < randomBytes.length; i++) {
    secret += BASE32_CHARS[randomBytes[i] % BASE32_CHARS.length];
  }
  return secret;
}

/**
 * Base32 decode helper
 */
function base32Decode(base32: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < base32.length; i++) {
    const char = base32[i].toUpperCase();
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Generates a 6-digit TOTP code for a given timestamp and secret using HMAC-SHA1 (RFC 6238)
 */
export function generateTotpCode(secret: string, timeStep = 30, timestamp = Date.now()): string {
  const epoch = Math.floor(timestamp / 1000);
  const timeCounter = Math.floor(epoch / timeStep);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(timeCounter));

  const keyBuffer = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', keyBuffer);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binaryCode % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP token against a secret with +/- 1 step window tolerance
 */
export function verifyTotpCode(
  secret: string,
  token: string,
  timeStep = 30,
  window = 1,
  timestamp = Date.now()
): boolean {
  if (!token || token.length !== 6) return false;

  const currentStep = Math.floor(timestamp / 1000 / timeStep);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const stepTime = (currentStep + errorWindow) * timeStep * 1000;
    const generated = generateTotpCode(secret, timeStep, stepTime);
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(generated))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates single-use backup recovery codes
 */
export function generateBackupCodes(count = 8): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    const formatted = `${code.slice(0, 5)}-${code.slice(5)}`;
    plain.push(formatted);
    hashed.push(crypto.createHash('sha256').update(formatted).digest('hex'));
  }

  return { plain, hashed };
}

/**
 * Hashes a backup code for verification
 */
export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/**
 * Generates enrollment payload with otpauth URL and QR code Data URL
 */
export async function createMfaEnrollment(
  userEmail: string,
  issuer = 'Web3StudentLab'
): Promise<TotpEnrollment> {
  const secret = generateTotpSecret();
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    userEmail
  )}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
  const { plain: backupCodes } = generateBackupCodes(8);

  return {
    secret,
    qrCodeUrl,
    backupCodes,
  };
}
