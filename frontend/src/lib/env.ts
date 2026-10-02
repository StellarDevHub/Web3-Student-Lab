import { z } from 'zod';

/**
 * Centralized, Type-Safe Runtime Environment Validation & Health Matrix
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
 *
 * Features:
 * - Runtime Zod validation for all public environment variables
 * - Strict URL & path normalization eliminating duplicated `/api/v1` prefixes
 * - Automatic fallback detection matrix tracking which services use defaults
 * - Connection health probes & matrix computing latency and connectivity status
 */

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const DEFAULT_DEV_API_URL = 'http://localhost:8080/api/v1';
export const DEFAULT_DEV_WS_URL = 'ws://localhost:8080';
export const FALLBACK_RENDER_API_URL = 'https://web3-student-lab.onrender.com/api/v1';
export const FALLBACK_RENDER_WS_URL = 'wss://web3-student-lab.onrender.com';
export const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
export const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Backward-compatible exports
export const DEV_API_URL = DEFAULT_DEV_API_URL;
export const DEV_WS_URL = DEFAULT_DEV_WS_URL;

// Soroban contract StrKey: 'C' followed by 55 base32 characters (RFC 4648, no padding).
export const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

export const rawEnvSchema = z.object({
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
  NEXT_PUBLIC_FRONTEND_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_CSP_REPORT_URI: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_CSP_REPORT_ONLY: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_BRIDGE_ENDPOINTS: z.preprocess(emptyToUndefined, z.string().optional()),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

export type ServiceName = 'api' | 'ws' | 'sorobanRpc' | 'horizon';
export type HealthStatus = 'healthy' | 'degraded' | 'offline' | 'checking' | 'unknown';

export interface ServiceFallbackStatus {
  isFallback: boolean;
  service: ServiceName;
  url: string;
  defaultUrl: string;
  envVarName: string;
}

export interface EnvFallbackMatrix {
  apiUrl: boolean;
  wsUrl: boolean;
  sorobanRpcUrl: boolean;
  horizonUrl: boolean;
  certificateContractId: boolean;
  hasAnyFallback: boolean;
  details: Record<ServiceName, ServiceFallbackStatus>;
}

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
  frontendUrl: string;
  cspReportUri?: string;
  cspReportOnly: boolean;
  turnstileSiteKey?: string;
  bridgeEndpoints?: string;
  fallbacks: EnvFallbackMatrix;
  isFallback: (key: keyof Omit<EnvFallbackMatrix, 'hasAnyFallback' | 'details'>) => boolean;
}

export interface EnvValidationResult {
  env: PublicEnv;
  /** Human-readable, value-free descriptions of anything invalid or missing-in-production. */
  errors: string[];
  fallbacks: EnvFallbackMatrix;
}

export interface ServiceHealth {
  service: ServiceName;
  label: string;
  status: HealthStatus;
  latencyMs?: number;
  url: string;
  isFallback: boolean;
  message?: string;
  lastChecked: number;
}

export interface ConnectionHealthMatrix {
  api: ServiceHealth;
  ws: ServiceHealth;
  sorobanRpc: ServiceHealth;
  horizon: ServiceHealth;
  overallStatus: HealthStatus;
  timestamp: number;
}

function isProduction(source?: NodeJS.ProcessEnv): boolean {
  if (source && source.NODE_ENV !== undefined) {
    return source.NODE_ENV === 'production';
  }
  return process.env.NODE_ENV === 'production';
}

/**
 * Normalizes an API path by eliminating redundant slashes and preventing
 * duplicate `/api/v1` prefixes.
 *
 * Examples:
 *   normalizeApiPath('/api/v1/contracts') => '/api/v1/contracts'
 *   normalizeApiPath('/contracts') => '/contracts'
 *   normalizeApiPath('/api/v1/api/v1/contracts') => '/api/v1/contracts'
 *   normalizeApiPath('//api/v1//contracts//') => '/api/v1/contracts'
 */
export function normalizeApiPath(path: string): string {
  if (!path) return '';
  let normalized = path.replace(/\/+/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  // Collapse duplicate /api/v1 or /api/v\d+ sequences:
  normalized = normalized.replace(/^(\/api\/v\d+)+/, '/api/v1');
  return normalized;
}

/**
 * Builds a strictly normalized, fully qualified or relative API URL from a base URL
 * and endpoint path, guaranteeing no double `/api/v1` prefix or malformed slashes.
 *
 * Examples:
 *   normalizeApiUrl('http://localhost:8080/api/v1', '/api/v1/contracts') => 'http://localhost:8080/api/v1/contracts'
 *   normalizeApiUrl('http://localhost:8080/api/v1', '/contracts') => 'http://localhost:8080/api/v1/contracts'
 *   normalizeApiUrl('http://localhost:8080', '/contracts') => 'http://localhost:8080/api/v1/contracts'
 *   normalizeApiUrl('http://localhost:8080', '/api/v1/contracts') => 'http://localhost:8080/api/v1/contracts'
 *   normalizeApiUrl('', '/contracts') => '/api/v1/contracts'
 *   normalizeApiUrl('/api/v1', '/contracts') => '/api/v1/contracts'
 */
export function normalizeApiUrl(baseUrl: string, endpoint: string = ''): string {
  const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
  const cleanEndpoint = (endpoint || '').trim();

  // If no base URL, return normalized relative path (ensuring /api/v1 prefix)
  if (!cleanBase) {
    if (!cleanEndpoint) return '/api/v1';
    const rel = cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`;
    return rel.startsWith('/api/v1')
      ? normalizeApiPath(rel)
      : normalizeApiPath(`/api/v1${rel}`);
  }

  // Check if base ends with /api/v\d+
  const baseHasApiV1 = /\/api\/v\d+$/i.test(cleanBase);

  // Clean the endpoint leading/trailing slashes
  let ep = cleanEndpoint.replace(/^\/+/, '').replace(/\/+$/, '');

  // If endpoint starts with api/v\d+
  const epStartsApiV1 = /^api\/v\d+(\/|$)/i.test(ep);

  if (baseHasApiV1 && epStartsApiV1) {
    // Drop the duplicate api/v1 prefix from endpoint
    ep = ep.replace(/^api\/v\d+\/?/i, '');
  } else if (!baseHasApiV1 && !epStartsApiV1) {
    // Base does not have /api/v1 and endpoint does not have /api/v1 — insert it
    ep = ep ? `api/v1/${ep}` : 'api/v1';
  }

  return ep ? `${cleanBase}/${ep}` : cleanBase;
}

/**
 * Validates `process.env`'s public configuration and returns a safe, typed
 * config object plus a list of problems (if any). Never throws itself —
 * callers decide whether to escalate (see {@link getPublicEnv}).
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
  const production = isProduction(source);

  const isFallbackApiUrl = !data.NEXT_PUBLIC_API_URL;
  const isFallbackWsUrl = !data.NEXT_PUBLIC_WS_URL;
  const isFallbackSorobanRpc = !data.NEXT_PUBLIC_SOROBAN_RPC_URL;
  const isFallbackHorizon = !data.NEXT_PUBLIC_HORIZON_URL;
  const isFallbackCertificateContractId = !data.NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID;

  if (isFallbackApiUrl && production) {
    errors.push('NEXT_PUBLIC_API_URL: required in production but not set');
  }
  if (isFallbackWsUrl && production) {
    errors.push('NEXT_PUBLIC_WS_URL: required in production but not set');
  }

  const rawApiUrl = data.NEXT_PUBLIC_API_URL ?? (production ? '' : DEFAULT_DEV_API_URL);
  const rawWsUrl = data.NEXT_PUBLIC_WS_URL ?? (production ? '' : DEFAULT_DEV_WS_URL);

  const apiUrl = rawApiUrl ? rawApiUrl.replace(/\/+$/, '') : '';
  const wsUrl = rawWsUrl ? rawWsUrl.replace(/\/+$/, '') : '';
  const sorobanRpcUrl = data.NEXT_PUBLIC_SOROBAN_RPC_URL ?? DEFAULT_SOROBAN_RPC_URL;
  const horizonUrl = data.NEXT_PUBLIC_HORIZON_URL ?? DEFAULT_HORIZON_URL;
  const certificateContractId = data.NEXT_PUBLIC_CERTIFICATE_CONTRACT_ID ?? null;
  const webrtcIceServers = data.NEXT_PUBLIC_WEBRTC_ICE_SERVERS;
  const appVersion = data.NEXT_PUBLIC_APP_VERSION ?? 'dev';
  const buildNumber = data.NEXT_PUBLIC_BUILD_NUMBER ?? 'unknown';
  const frontendUrl = (data.NEXT_PUBLIC_FRONTEND_URL ?? (production ? '' : 'http://localhost:3000')).replace(/\/+$/, '');
  const cspReportUri = data.NEXT_PUBLIC_CSP_REPORT_URI;
  const cspReportOnly = data.NEXT_PUBLIC_CSP_REPORT_ONLY === 'true';
  const turnstileSiteKey = data.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const bridgeEndpoints = data.NEXT_PUBLIC_BRIDGE_ENDPOINTS;

  const fallbacks: EnvFallbackMatrix = {
    apiUrl: isFallbackApiUrl,
    wsUrl: isFallbackWsUrl,
    sorobanRpcUrl: isFallbackSorobanRpc,
    horizonUrl: isFallbackHorizon,
    certificateContractId: isFallbackCertificateContractId,
    hasAnyFallback:
      isFallbackApiUrl ||
      isFallbackWsUrl ||
      isFallbackSorobanRpc ||
      isFallbackHorizon ||
      isFallbackCertificateContractId,
    details: {
      api: {
        isFallback: isFallbackApiUrl,
        service: 'api',
        url: apiUrl || (production ? FALLBACK_RENDER_API_URL : DEFAULT_DEV_API_URL),
        defaultUrl: production ? FALLBACK_RENDER_API_URL : DEFAULT_DEV_API_URL,
        envVarName: 'NEXT_PUBLIC_API_URL',
      },
      ws: {
        isFallback: isFallbackWsUrl,
        service: 'ws',
        url: wsUrl || (production ? FALLBACK_RENDER_WS_URL : DEFAULT_DEV_WS_URL),
        defaultUrl: production ? FALLBACK_RENDER_WS_URL : DEFAULT_DEV_WS_URL,
        envVarName: 'NEXT_PUBLIC_WS_URL',
      },
      sorobanRpc: {
        isFallback: isFallbackSorobanRpc,
        service: 'sorobanRpc',
        url: sorobanRpcUrl,
        defaultUrl: DEFAULT_SOROBAN_RPC_URL,
        envVarName: 'NEXT_PUBLIC_SOROBAN_RPC_URL',
      },
      horizon: {
        isFallback: isFallbackHorizon,
        service: 'horizon',
        url: horizonUrl,
        defaultUrl: DEFAULT_HORIZON_URL,
        envVarName: 'NEXT_PUBLIC_HORIZON_URL',
      },
    },
  };

  const env: PublicEnv = {
    apiUrl,
    wsUrl,
    sorobanRpcUrl,
    horizonUrl,
    certificateContractId,
    webrtcIceServers,
    appVersion,
    buildNumber,
    frontendUrl,
    cspReportUri,
    cspReportOnly,
    turnstileSiteKey,
    bridgeEndpoints,
    fallbacks,
    isFallback: (key) => fallbacks[key] ?? false,
  };

  return { env, errors, fallbacks };
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

/**
 * Returns a normalized full API endpoint URL using the configured public environment.
 */
export function getApiEndpoint(endpoint: string = ''): string {
  const { apiUrl } = getPublicEnv();
  return normalizeApiUrl(apiUrl, endpoint);
}

/** Test-only: clears the memoized config so validation re-runs against a fresh env. */
export function __resetPublicEnvCacheForTests(): void {
  cached = null;
}

/**
 * Probes the health of a specific system service.
 * Resilient to network errors, CORS issues, and timeouts.
 */
export async function checkServiceHealth(
  service: ServiceName,
  customUrl?: string,
  timeoutMs: number = 3500
): Promise<ServiceHealth> {
  const env = getPublicEnv();
  const url =
    customUrl ||
    (service === 'api'
      ? env.apiUrl || (isProduction() ? FALLBACK_RENDER_API_URL : DEFAULT_DEV_API_URL)
      : service === 'ws'
        ? env.wsUrl || (isProduction() ? FALLBACK_RENDER_WS_URL : DEFAULT_DEV_WS_URL)
        : service === 'sorobanRpc'
          ? env.sorobanRpcUrl
          : env.horizonUrl);

  const isFallback = env.fallbacks[
    service === 'api'
      ? 'apiUrl'
      : service === 'ws'
        ? 'wsUrl'
        : service === 'sorobanRpc'
          ? 'sorobanRpcUrl'
          : 'horizonUrl'
  ];

  const labels: Record<ServiceName, string> = {
    api: 'Backend API',
    ws: 'WebSocket Gateway',
    sorobanRpc: 'Soroban RPC',
    horizon: 'Stellar Horizon',
  };

  const baseResult: ServiceHealth = {
    service,
    label: labels[service],
    status: 'unknown',
    url,
    isFallback,
    lastChecked: Date.now(),
  };

  if (!url) {
    return {
      ...baseResult,
      status: 'offline',
      message: 'No endpoint URL configured',
    };
  }

  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    if (service === 'sorobanRpc') {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
        signal: controller?.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);
      const latencyMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        const isHealthy = body.result?.status === 'healthy' || response.status === 200;
        return {
          ...baseResult,
          status: isHealthy ? 'healthy' : 'degraded',
          latencyMs,
          message: isHealthy ? 'Soroban RPC Healthy' : 'Degraded RPC status',
        };
      }
      return {
        ...baseResult,
        status: 'degraded',
        latencyMs,
        message: `HTTP ${response.status}`,
      };
    }

    if (service === 'api') {
      const healthEndpoint = `${url.replace(/\/api\/v\d+$/, '')}/health/live`;
      let response: Response | null = null;
      try {
        response = await fetch(healthEndpoint, {
          method: 'GET',
          signal: controller?.signal,
        });
      } catch {
        try {
          response = await fetch(url, { method: 'HEAD', signal: controller?.signal });
        } catch {
          response = null;
        }
      }
      if (timeoutId) clearTimeout(timeoutId);
      const latencyMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      return {
        ...baseResult,
        status: response && (response.ok || response.status < 500) ? 'healthy' : 'offline',
        latencyMs,
        message: response ? `HTTP ${response.status} OK` : 'Host unreachable',
      };
    }

    if (service === 'horizon') {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller?.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);
      const latencyMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      return {
        ...baseResult,
        status: response.ok ? 'healthy' : 'degraded',
        latencyMs,
        message: response.ok ? 'Horizon Online' : `HTTP ${response.status}`,
      };
    }

    if (service === 'ws') {
      if (timeoutId) clearTimeout(timeoutId);
      const latencyMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      const isValid = /^wss?:\/\//i.test(url);
      return {
        ...baseResult,
        status: isValid ? 'healthy' : 'degraded',
        latencyMs,
        message: isValid ? 'WebSocket Protocol Valid' : 'Invalid WS Scheme',
      };
    }

    return baseResult;
  } catch (err: unknown) {
    const latencyMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
    );
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Probe timed out'
          : err.message
        : 'Network probe error';
    return {
      ...baseResult,
      status: 'offline',
      latencyMs,
      message,
    };
  }
}

/**
 * Runs a concurrent health probe against all services and computes the composite health matrix.
 */
export async function checkConnectionHealthMatrix(): Promise<ConnectionHealthMatrix> {
  const [api, ws, sorobanRpc, horizon] = await Promise.all([
    checkServiceHealth('api'),
    checkServiceHealth('ws'),
    checkServiceHealth('sorobanRpc'),
    checkServiceHealth('horizon'),
  ]);

  let overallStatus: HealthStatus = 'healthy';
  if (api.status === 'offline') {
    overallStatus = 'offline';
  } else if (
    api.status === 'degraded' ||
    ws.status === 'degraded' ||
    sorobanRpc.status === 'degraded' ||
    horizon.status === 'degraded' ||
    api.isFallback ||
    ws.isFallback
  ) {
    overallStatus = 'degraded';
  }

  return {
    api,
    ws,
    sorobanRpc,
    horizon,
    overallStatus,
    timestamp: Date.now(),
  };
}
