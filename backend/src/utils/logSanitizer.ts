/**
 * Log sanitization / PII masking (#1425 / BE-HARD-34).
 *
 * Masks secrets and PII that appear either as sensitive object keys or
 * embedded inside free-text values (log messages, headers, bodies):
 *   • Stellar Ed25519 secret seeds (`S` + 55 base32 chars)
 *   • PEM / 0x-prefixed private keys
 *   • password assignments (`password=…`, `"password":"…"`)
 *   • email addresses, credit-card numbers
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'authorization',
  'privatekey',
  'apikey',
  'credential',
  'secretkey',
  'accesstoken',
  'refreshtoken',
  'cookie',
  'passwd',
  'pwd',
  'x-api-key',
  'set-cookie',
]);

/** Email addresses, unanchored so addresses embedded in longer text are masked. */
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g;
const CARD_REGEX = /(?:\d{4}[-\s]?){4}/g;
/** Stellar Ed25519 secret seed: 'S' followed by 55 base32 characters. */
const STELLAR_SEED_REGEX = /\bS[A-Z2-7]{55}\b/g;
/** 0x-prefixed 32-byte private key. */
const HEX_PRIVATE_KEY_REGEX = /\b0x[a-fA-F0-9]{64}\b/g;
/** PEM-encoded private key blocks. */
const PEM_PRIVATE_KEY_REGEX =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
/** password=…, password: "…", "password":"…". */
const PASSWORD_REGEX = /(password|passwd|pwd)("?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&"']+)/gi;

function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return '***@***';
  const local = value.slice(0, at);
  const domain = value.slice(at);
  return `${local[0]}***${domain}`;
}

function maskCard(value: string): string {
  const digits = value.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  const groups = last4.match(/.{1,4}/g) ?? [last4];
  return `****-****-****-${groups.join('-')}`;
}

/** Mask a Stellar secret seed, preserving only the `S` type prefix. */
export function maskStellarSeed(_seed: string): string {
  return 'S***';
}

/**
 * Mask every known secret/PII pattern inside a single string. Safe to call on
 * log messages, header values, stack traces, etc.
 */
export function sanitizeString(value: string): string {
  return value
    .replace(PEM_PRIVATE_KEY_REGEX, '[REDACTED_PRIVATE_KEY]')
    .replace(STELLAR_SEED_REGEX, (match) => maskStellarSeed(match))
    .replace(HEX_PRIVATE_KEY_REGEX, '[REDACTED_PRIVATE_KEY]')
    .replace(PASSWORD_REGEX, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(EMAIL_REGEX, (match) => maskEmail(match))
    .replace(CARD_REGEX, (match) => maskCard(match));
}

export function redactSensitiveData(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeString(input);
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item));
  }

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSensitiveData(value);
      }
    }
    return out;
  }

  return input;
}
