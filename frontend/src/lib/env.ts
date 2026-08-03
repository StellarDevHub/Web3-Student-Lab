import { z } from 'zod';

/**
 * Typed, validated public runtime configuration.
 *
 * Only `NEXT_PUBLIC_*` variables belong here — Next.js inlines them into the
 * client bundle at build time, so nothing read through this module can ever
 * be a server-only secret. Server-only config must not be added to this
 * schema or exposed through `getPublicEnv()`.
 *
 * `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` are treated as required in
 * production (a deployed app pointed at localhost is a misconfiguration, not
 * a usable default) but fall back to local dev values outside production so
 * `next dev` keeps working with an empty `.env.local`.
 *
 * Soroban RPC/Horizon URLs and the certificate contract ID back optional
 * Web3 features: they have safe public-network defaults (RPC/Horizon) or
 * degrade to "feature disabled" (contract ID) rather than failing the whole
 * app when absent.
 */

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const DEV_API_URL = 'http://localhost:8080/api/v1';
const DEV_WS_URL = 'ws://localhost:8080';
export const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
export const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Soroban contract StrKey: 'C' followed by 55 base32 characters (RFC 4648, no padding).
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

const rawEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_WS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SOROBAN_RPC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_HORIZON_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID: z.preprocess(
    emptyToUndefined,
    z.string().regex(CONTRACT_ID_PATTERN, 'must be a valid Soroban contract id (e.g. C...)').optional(),
  ),
  NEXT_PUBLIC_WEBRTC_ICE_SERVERS: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_APP_VERSION: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_BUILD_NUMBER: z.preprocess(emptyToUndefined, z.string().optional()),
});

export interface PublicEnv {
  apiUrl: string;
  wsUrl: string;
  sorobanRpcUrl: string;
  horizonUrl: string;
  /** null when no (valid) contract id is configured — dependent features should degrade, not throw. */
  certificateContractId: string | null;
  webrtcIceServers: string | undefined;
  appVersion: string;
  buildNumber: string;
}

export interface EnvValidationResult {
  env: PublicEnv;
  /** Human-readable, value-free descriptions of anything invalid or missing-in-production. */
  errors: string[];
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Validates `process.env`'s public configuration and returns a safe, typed
 * config object plus a list of problems (if any). Never throws itself —
 * callers decide whether to escalate (see {@link assertValidPublicEnv}).
 */
export function validatePublicEnv(source: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const parsed = rawEnvSchema.safeParse(source);
  const errors: string[] = [];

  // Malformed values (present but fail schema, e.g. not a URL) are always
  // reported, dev or prod — a typo shouldn't only ever surface as a runtime
  // fetch failure downstream.
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      errors.push(`${key}: ${issue.message}`);
    }
  }

  const data = parsed.success ? parsed.data : rawEnvSchema.partial().parse({});

  const production = isProduction();

  if (!data.NEXT_PUBLIC_API_URL) {
    if (production) errors.push('NEXT_PUBLIC_API_URL: required in production but not set');
  }
  if (!data.NEXT_PUBLIC_WS_URL) {
    if (production) errors.push('NEXT_PUBLIC_WS_URL: required in production but not set');
  }

  const env: PublicEnv = {
    apiUrl: (data.NEXT_PUBLIC_API_URL ?? (production ? '' : DEV_API_URL)).replace(/\/+$/, ''),
    wsUrl: data.NEXT_PUBLIC_WS_URL ?? (production ? '' : DEV_WS_URL),
    sorobanRpcUrl: data.NEXT_PUBLIC_SOROBAN_RPC_URL ?? DEFAULT_SOROBAN_RPC_URL,
    horizonUrl: data.NEXT_PUBLIC_HORIZON_URL ?? DEFAULT_HORIZON_URL,
    certificateContractId: data.NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID ?? null,
    webrtcIceServers: data.NEXT_PUBLIC_WEBRTC_ICE_SERVERS,
    appVersion: data.NEXT_PUBLIC_APP_VERSION ?? 'dev',
    buildNumber: data.NEXT_PUBLIC_BUILD_NUMBER ?? 'unknown',
  };

  return { env, errors };
}

let cached: PublicEnv | null = null;

/**
 * Returns the validated public config, computed once and memoized.
 *
 * - In development: throws with every problem listed (key names only, never
 *   values) so a misconfiguration is loud and immediate instead of a vague
 *   wallet/RPC failure three clicks later.
 * - In production: never throws (a config problem shouldn't blank-page every
 *   visitor); logs the same key-only diagnostics once via `console.error`
 *   and returns best-effort defaults so optional features degrade instead
 *   of crashing the app shell.
 */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const { env, errors } = validatePublicEnv();

  if (errors.length > 0) {
    const message = `Invalid frontend runtime configuration:\n- ${errors.join('\n- ')}`;
    if (isProduction()) {
      console.error(message);
    } else {
      throw new Error(message);
    }
  }

  cached = env;
  return env;
}

/** Test-only: clears the memoized config so validation re-runs against a fresh env. */
export function __resetPublicEnvCacheForTests(): void {
  cached = null;
}
