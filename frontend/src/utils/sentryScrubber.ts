export const STELLAR_SECRET_KEY_REGEX = /\bS[A-Z2-7]{55}\b/g;
export const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
export const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'passkey',
  'credential',
  'privatekey',
  'seed',
]);

export const REDACTED_SECRET_PLACEHOLDER = '[REDACTED_STELLAR_SECRET]';
export const REDACTED_AUTH_PLACEHOLDER = '[REDACTED_AUTH]';

export function scrubSensitiveString(input: string): string {
  return input
    .replace(STELLAR_SECRET_KEY_REGEX, REDACTED_SECRET_PLACEHOLDER)
    .replace(BEARER_TOKEN_REGEX, `Bearer ${REDACTED_AUTH_PLACEHOLDER}`);
}

export function scrubTelemetryValue<T>(value: T): T {
  if (typeof value === 'string') {
    return scrubSensitiveString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubTelemetryValue(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = k.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) || SENSITIVE_HEADER_KEYS.has(normalizedKey)) {
        out[k] = REDACTED_AUTH_PLACEHOLDER;
      } else {
        out[k] = scrubTelemetryValue(v);
      }
    }
    return out as T;
  }
  return value;
}

export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  return scrubTelemetryValue(event);
}

export function scrubSentryBreadcrumb<T extends Record<string, unknown>>(
  breadcrumb: T
): T {
  return scrubTelemetryValue(breadcrumb);
}
