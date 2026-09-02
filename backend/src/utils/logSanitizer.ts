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
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARD_REGEX = /(?:\d{4}[-\s]?){4}/g;

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

export function redactSensitiveData(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    if (EMAIL_REGEX.test(input)) {
      return maskEmail(input);
    }
    if (CARD_REGEX.test(input)) {
      return input.replace(CARD_REGEX, (match) => maskCard(match));
    }
    return input;
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
