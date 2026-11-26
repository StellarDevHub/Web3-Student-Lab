/**
 * redact.ts — PII and secret scrubbing for crash telemetry (FE-099).
 *
 * Everything that leaves the browser in a crash report — the error message,
 * breadcrumbs, the state snapshot, a user's free-text comment — goes through
 * here first. The rules err on the side of removing too much: a crash report is
 * only useful if it is safe to send, and the engineer reading it does not need
 * a student's full wallet address, only enough to tell two wallets apart.
 *
 * Kept free of React and Sentry imports so `sentry.client.config.ts` can use it
 * in `beforeSend` / `beforeBreadcrumb` without pulling the UI into the init path.
 */

const REDACTED = '[redacted]';

/** Stellar secret seeds: `S` + 55 base32 chars. Never leaves the browser, under any name. */
const STELLAR_SECRET = /\bS[A-Z2-7]{55}\b/g;
/** Account (`G…`) and contract (`C…`) addresses are 56 chars; muxed (`M…`) are 69. */
const STELLAR_ADDRESS = /\b[GC][A-Z2-7]{55}\b|\bM[A-Z2-7]{68}\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;

/** Keys whose values are dropped wholesale, whatever they contain. */
const SENSITIVE_KEY =
  /secret|password|passphrase|mnemonic|seed|private|token|authorization|cookie|email|signature/i;

/**
 * Mask an address to its first and last four characters: `GABC…WXYZ`. Enough to
 * correlate crashes from the same wallet, not enough to identify or look it up.
 */
export function maskAddress(address: string): string {
  const value = address.trim();
  if (value.length < 12) return REDACTED;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Scrub secrets and personal identifiers out of free text. */
export function redactString(input: string): string {
  return input
    .replace(STELLAR_SECRET, '[redacted-secret]')
    .replace(JWT, '[jwt]')
    .replace(BEARER, 'Bearer [token]')
    .replace(EMAIL, '[email]')
    .replace(STELLAR_ADDRESS, (match) => maskAddress(match));
}

/**
 * A URL reduced to origin-free path form. Query strings and fragments routinely
 * carry tokens and wallet addresses, so only their presence is kept.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://placeholder.invalid');
    const path = redactString(parsed.pathname);
    return parsed.search ? `${path}?[redacted]` : path;
  } catch {
    return redactString(url.split(/[?#]/)[0]);
  }
}

const MAX_DEPTH = 6;
const MAX_KEYS = 60;
const MAX_ARRAY = 60;
const MAX_STRING = 2000;

/** Recursively scrub a value: strings are redacted, sensitive keys are dropped, size is capped. */
export function redactDeep<T = unknown>(value: T, depth = 0): T {
  if (typeof value === 'string') {
    const scrubbed = redactString(value);
    return (scrubbed.length > MAX_STRING ? `${scrubbed.slice(0, MAX_STRING)}…` : scrubbed) as T;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]' as unknown as T;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => redactDeep(item, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (count >= MAX_KEYS) break;
    count += 1;
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactDeep(item, depth + 1);
  }
  return out as T;
}

/** Minimal event shape used by `scrubEvent`, so this file does not import Sentry types. */
interface ScrubbableEvent {
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: unknown;
    data?: unknown;
  };
  user?: Record<string, unknown>;
  breadcrumbs?: unknown;
  contexts?: unknown;
  extra?: unknown;
  tags?: unknown;
}

/**
 * `beforeSend` for Sentry: scrub everything on the event. The user is reduced to
 * an id (already a masked address when we set it) — no ip, email or username.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const scrubbed: ScrubbableEvent = { ...event };

  if (typeof scrubbed.message === 'string') scrubbed.message = redactString(scrubbed.message);

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((v) => ({
        ...v,
        value: typeof v.value === 'string' ? redactString(v.value) : v.value,
      })),
    };
  }

  if (scrubbed.request) {
    scrubbed.request = {
      url: typeof scrubbed.request.url === 'string' ? redactUrl(scrubbed.request.url) : undefined,
    };
  }

  if (scrubbed.user) {
    const id = scrubbed.user.id;
    scrubbed.user = typeof id === 'string' ? { id: redactString(id) } : {};
  }

  if (scrubbed.breadcrumbs) scrubbed.breadcrumbs = redactDeep(scrubbed.breadcrumbs);
  if (scrubbed.contexts) scrubbed.contexts = redactDeep(scrubbed.contexts);
  if (scrubbed.extra) scrubbed.extra = redactDeep(scrubbed.extra);
  if (scrubbed.tags) scrubbed.tags = redactDeep(scrubbed.tags);

  return scrubbed as T;
}

/** Minimal breadcrumb shape for `scrubBreadcrumb`. */
interface ScrubbableBreadcrumb {
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * `beforeBreadcrumb` for Sentry. URLs in fetch/xhr/navigation data are reduced to
 * their path, and everything else is scrubbed.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T {
  const scrubbed: ScrubbableBreadcrumb = { ...breadcrumb };
  if (typeof scrubbed.message === 'string') scrubbed.message = redactString(scrubbed.message);

  if (scrubbed.data) {
    const data: Record<string, unknown> = { ...scrubbed.data };
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = redactUrl(data[key] as string);
    }
    scrubbed.data = redactDeep(data);
  }
  return scrubbed as T;
}
