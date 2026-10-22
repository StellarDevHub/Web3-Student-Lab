import { readFile } from 'fs/promises';

/**
 * HashiCorp Vault configuration for the custodial relayer HSM signer (BE-002).
 *
 * The relayer key lives in Vault's Transit secrets engine (optionally backed
 * by a PKCS#11 HSM via Vault Enterprise "managed keys"). The application only
 * ever holds a short-lived Vault token — never the Ed25519 private key. All
 * signatures are produced by `POST /v1/<transit>/sign/<key>` inside Vault.
 */

export type VaultAuthMethod = 'token' | 'kubernetes' | 'approle';

export interface VaultConfig {
  /** Vault server address, e.g. https://vault.internal:8200 */
  address: string;
  /** Vault Enterprise namespace (sent as `X-Vault-Namespace`). */
  namespace?: string;
  authMethod: VaultAuthMethod;
  /** Static token — only for `token` auth. Prefer kubernetes/approle in production. */
  token?: string;
  /** Kubernetes auth role and the projected service-account JWT path. */
  kubernetesRole?: string;
  kubernetesJwtPath: string;
  kubernetesMountPath: string;
  /** AppRole credentials. The secret id should be delivered via a wrapped token / file mount. */
  appRoleId?: string;
  appRoleSecretId?: string;
  appRoleMountPath: string;
  /** Transit engine mount and the Ed25519 key name holding the relayer key. */
  transitMountPath: string;
  transitKeyName: string;
  /** Pin a key version; omit to sign with the latest version. */
  transitKeyVersion?: number;
  /** Per-request timeout in milliseconds. */
  requestTimeoutMs: number;
}

const DEFAULT_K8S_JWT_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseAuthMethod(value: string | undefined): VaultAuthMethod {
  if (value === 'kubernetes' || value === 'approle') return value;
  return 'token';
}

/** Read the Vault configuration from the environment without validating it. */
export function loadVaultConfig(env: NodeJS.ProcessEnv = process.env): VaultConfig {
  return {
    address: (env.VAULT_ADDR || '').replace(/\/+$/, ''),
    namespace: env.VAULT_NAMESPACE || undefined,
    authMethod: parseAuthMethod(env.VAULT_AUTH_METHOD),
    token: env.VAULT_TOKEN || undefined,
    kubernetesRole: env.VAULT_K8S_ROLE || undefined,
    kubernetesJwtPath: env.VAULT_K8S_JWT_PATH || DEFAULT_K8S_JWT_PATH,
    kubernetesMountPath: env.VAULT_K8S_MOUNT_PATH || 'kubernetes',
    appRoleId: env.VAULT_APPROLE_ROLE_ID || undefined,
    appRoleSecretId: env.VAULT_APPROLE_SECRET_ID || undefined,
    appRoleMountPath: env.VAULT_APPROLE_MOUNT_PATH || 'approle',
    transitMountPath: env.VAULT_TRANSIT_MOUNT || 'transit',
    transitKeyName: env.VAULT_TRANSIT_KEY || 'stellar-relayer',
    transitKeyVersion: parseOptionalInt(env.VAULT_TRANSIT_KEY_VERSION),
    requestTimeoutMs: parseOptionalInt(env.VAULT_REQUEST_TIMEOUT_MS) ?? 5000,
  };
}

/** Throws a descriptive error when the config cannot be used to sign. */
export function assertVaultConfig(config: VaultConfig): void {
  const missing: string[] = [];
  if (!config.address) missing.push('VAULT_ADDR');
  if (!config.transitKeyName) missing.push('VAULT_TRANSIT_KEY');

  if (config.authMethod === 'token' && !config.token) missing.push('VAULT_TOKEN');
  if (config.authMethod === 'kubernetes' && !config.kubernetesRole) missing.push('VAULT_K8S_ROLE');
  if (config.authMethod === 'approle') {
    if (!config.appRoleId) missing.push('VAULT_APPROLE_ROLE_ID');
    if (!config.appRoleSecretId) missing.push('VAULT_APPROLE_SECRET_ID');
  }

  if (missing.length > 0) {
    throw new Error(`Vault HSM signer is misconfigured; missing: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production' && !config.address.startsWith('https://')) {
    throw new Error('VAULT_ADDR must use https:// in production');
  }
}

export interface VaultResponse<TData> {
  request_id: string;
  lease_id?: string;
  renewable?: boolean;
  lease_duration?: number;
  data: TData;
  auth?: {
    client_token: string;
    lease_duration: number;
    renewable: boolean;
  } | null;
  warnings?: string[] | null;
}

/**
 * Minimal Vault HTTP client built on the global `fetch` (Node 18+), so no
 * additional dependency is required. It handles login, token caching with
 * early renewal, and request timeouts.
 */
export class VaultClient {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: VaultConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {
    if (!this.fetchImpl) {
      throw new Error('Global fetch is unavailable; Node.js 18+ is required for the Vault signer');
    }
  }

  public getConfig(): Readonly<VaultConfig> {
    return this.config;
  }

  public async request<TData>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options: { authenticated?: boolean } = {},
  ): Promise<VaultResponse<TData>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.namespace) headers['X-Vault-Namespace'] = this.config.namespace;
    if (options.authenticated !== false) headers['X-Vault-Token'] = await this.getToken();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(`${this.config.address}/v1/${path.replace(/^\/+/, '')}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      const json = text ? (JSON.parse(text) as VaultResponse<TData> & { errors?: string[] }) : null;

      if (!response.ok || !json) {
        if (response.status === 403) this.invalidateToken();
        const detail = json?.errors?.join('; ') || response.statusText || 'empty response';
        throw new Error(`Vault ${method} ${path} failed (${response.status}): ${detail}`);
      }

      return json;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Vault ${method} ${path} timed out after ${this.config.requestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  public invalidateToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  private async getToken(): Promise<string> {
    if (this.config.authMethod === 'token') {
      if (!this.config.token) throw new Error('VAULT_TOKEN is not configured');
      return this.config.token;
    }

    // Renew 30s before expiry so an in-flight sign never races token expiry.
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.cachedToken;
    }

    const login = await this.login();
    if (!login.auth?.client_token) {
      throw new Error(`Vault ${this.config.authMethod} login did not return a client token`);
    }

    this.cachedToken = login.auth.client_token;
    this.tokenExpiresAt = Date.now() + Math.max(login.auth.lease_duration, 60) * 1000;
    return this.cachedToken;
  }

  private async login(): Promise<VaultResponse<unknown>> {
    if (this.config.authMethod === 'kubernetes') {
      const jwt = (await readFile(this.config.kubernetesJwtPath, 'utf8')).trim();
      return this.request(
        'POST',
        `auth/${this.config.kubernetesMountPath}/login`,
        { role: this.config.kubernetesRole, jwt },
        { authenticated: false },
      );
    }

    return this.request(
      'POST',
      `auth/${this.config.appRoleMountPath}/login`,
      { role_id: this.config.appRoleId, secret_id: this.config.appRoleSecretId },
      { authenticated: false },
    );
  }
}

/**
 * Vault policy granting the relayer only sign + read-public-key on its
 * transit key. Export, backup, and key-config endpoints stay denied, so the
 * private key can never leave the Vault/HSM boundary.
 */
export const getVaultRelayerPolicy = (transitMount = 'transit', keyName = 'stellar-relayer'): string =>
  [
    `path "${transitMount}/sign/${keyName}" {`,
    '  capabilities = ["update"]',
    '}',
    `path "${transitMount}/sign/${keyName}/*" {`,
    '  capabilities = ["update"]',
    '}',
    `path "${transitMount}/keys/${keyName}" {`,
    '  capabilities = ["read"]',
    '}',
    `path "${transitMount}/export/*" {`,
    '  capabilities = ["deny"]',
    '}',
    `path "${transitMount}/backup/*" {`,
    '  capabilities = ["deny"]',
    '}',
  ].join('\n');
