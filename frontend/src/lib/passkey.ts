/**
 * Passkey / WebAuthn (FIDO2) Client Utilities
 *
 * Full ceremony lifecycle for WebAuthn passkeys, built on
 * `@simplewebauthn/browser`:
 *
 *  - Capability detection (WebAuthn, platform authenticator, autofill, PRF)
 *  - Registration of platform authenticators (Touch ID, Face ID, Windows Hello)
 *    and roaming hardware keys (YubiKey and other FIDO2 security keys)
 *  - Authentication / biometric re-authentication
 *  - Friendly, typed error classification (cancelled, timed out, already
 *    registered, ...) so the UI never shows a raw DOMException
 *  - Multi-key nickname helpers
 *  - SEP-0010 challenge signing: the passkey's PRF extension output is used as
 *    a deterministic ed25519 seed, so a biometric prompt yields a Stellar
 *    keypair that signs the challenge accepted by `/auth/sep10/token`.
 *
 * Private key material never leaves the authenticator; the derived Stellar
 * seed only exists in memory for the duration of a single signing operation.
 */

import {
  WebAuthnAbortService,
  base64URLStringToBuffer,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  bufferToBase64URLString,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { getPublicEnv, normalizeApiUrl } from './env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which kind of authenticator the user wants to register. */
export type AuthenticatorPreference = 'platform' | 'cross-platform' | 'any';

export interface PasskeyRegistrationOptions {
  userId: string;
  userName: string;
  userDisplayName: string;
  /** Human-friendly label for this key, e.g. "MacBook Touch ID". */
  nickname?: string;
  /** Defaults to `platform` when available, otherwise `any`. */
  authenticator?: AuthenticatorPreference;
}

export interface PasskeyAuthenticationOptions {
  userId?: string;
  /** Restrict the ceremony to a single registered credential. */
  credentialId?: string;
}

export interface PasskeyCredential {
  id: string;
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  signCount: number;
  deviceName?: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

export type PasskeyErrorCode =
  | 'unsupported'
  | 'no-authenticator'
  | 'cancelled'
  | 'timeout'
  | 'already-registered'
  | 'invalid-domain'
  | 'unsupported-algorithm'
  | 'prf-unsupported'
  | 'credential-mismatch'
  | 'challenge-invalid'
  | 'network'
  | 'server'
  | 'unknown';

export interface RegistrationResult {
  success: boolean;
  credentialId?: string;
  publicKeyX?: string;
  publicKeyY?: string;
  nickname?: string;
  authenticatorAttachment?: 'platform' | 'cross-platform';
  transports?: string[];
  /** True when the authenticator supports the PRF extension (needed for SEP-0010). */
  prfEnabled?: boolean;
  /** Stellar account derived from the passkey, when PRF output was returned at creation. */
  stellarPublicKey?: string;
  error?: string;
  errorCode?: PasskeyErrorCode;
}

export interface AuthenticationResult {
  success: boolean;
  credentialId?: string;
  verified?: boolean;
  signCount?: number;
  error?: string;
  errorCode?: PasskeyErrorCode;
}

export interface AuthenticatorCapabilities {
  webauthn: boolean;
  platformAuthenticator: boolean;
  conditionalMediation: boolean;
  /** `true`/`false` when the browser reports it, `null` when unknown. */
  prf: boolean | null;
  platformLabel: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const FRIENDLY_MESSAGES: Record<PasskeyErrorCode, string> = {
  unsupported:
    "This browser doesn't support passkeys. Try the latest Chrome, Safari, Edge or Firefox.",
  'no-authenticator':
    'No biometric sensor was found on this device. You can still use a hardware security key such as a YubiKey.',
  cancelled:
    'The passkey prompt was closed before it finished. No changes were made — you can try again whenever you are ready.',
  timeout:
    'The passkey prompt timed out. Try again and complete the fingerprint, face or security key step a little sooner.',
  'already-registered':
    'This authenticator is already registered to your account. Use a different device or security key to add another passkey.',
  'invalid-domain':
    "Passkeys can't be used on this address. Make sure you are on the official Web3 Student Lab site over HTTPS.",
  'unsupported-algorithm':
    "This authenticator doesn't support the P-256 signatures Stellar smart wallets need. Try a different device or security key.",
  'prf-unsupported':
    "This passkey can't sign Stellar challenges because the authenticator doesn't support the PRF extension. Try a recent YubiKey, iCloud Keychain, Google Password Manager or Windows Hello.",
  'credential-mismatch':
    "That passkey doesn't belong to this wallet. Choose the passkey you registered for this account.",
  'challenge-invalid':
    'The sign-in challenge from the server looked wrong, so it was not signed. Please try again.',
  network: "We couldn't reach the server. Check your connection and try again.",
  server: 'The server could not complete the request. Please try again in a moment.',
  unknown: 'Something went wrong with the passkey. Please try again.',
};

export function getFriendlyPasskeyMessage(code: PasskeyErrorCode): string {
  return FRIENDLY_MESSAGES[code];
}

/** Error codes the user can resolve simply by trying the same action again. */
const RETRYABLE: ReadonlySet<PasskeyErrorCode> = new Set<PasskeyErrorCode>([
  'cancelled',
  'timeout',
  'network',
  'server',
  'challenge-invalid',
  'unknown',
]);

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;
  readonly retryable: boolean;

  constructor(code: PasskeyErrorCode, message?: string, cause?: unknown) {
    super(message ?? FRIENDLY_MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'PasskeyError';
    this.code = code;
    this.retryable = RETRYABLE.has(code);
  }
}

/** Server/API failure surfaced from our own backend (not the authenticator). */
class PasskeyApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'PasskeyApiError';
  }
}

interface ClassifyContext {
  /** Milliseconds the ceremony ran before failing. */
  elapsedMs?: number;
  /** Ceremony timeout in milliseconds. */
  timeoutMs?: number;
  ceremony?: 'registration' | 'authentication';
}

/**
 * Map any error thrown during a WebAuthn ceremony to a typed, user-friendly
 * `PasskeyError`.
 *
 * Browsers deliberately report both "user cancelled" and "timed out" as
 * `NotAllowedError`, so the elapsed time is compared with the ceremony timeout
 * to tell them apart.
 */
export function classifyPasskeyError(error: unknown, ctx: ClassifyContext = {}): PasskeyError {
  if (error instanceof PasskeyError) return error;

  if (error instanceof PasskeyApiError) {
    return new PasskeyError(
      error.status === undefined ? 'network' : 'server',
      error.message || undefined,
      error
    );
  }

  const err = error as { name?: string; code?: string; message?: string; cause?: unknown } | null;
  // @simplewebauthn wraps DOMExceptions in a WebAuthnError whose `cause` is the original.
  const cause = (err?.cause ?? null) as { name?: string } | null;
  const name = cause?.name ?? err?.name ?? '';
  const code = err?.code ?? '';

  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') {
    return new PasskeyError(
      ctx.ceremony === 'authentication' ? 'credential-mismatch' : 'already-registered',
      undefined,
      error
    );
  }

  if (
    code === 'ERROR_INVALID_DOMAIN' ||
    code === 'ERROR_INVALID_RP_ID' ||
    name === 'SecurityError'
  ) {
    return new PasskeyError('invalid-domain', undefined, error);
  }

  if (code === 'ERROR_MALFORMED_PUBKEYCREDPARAMS' || code === 'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG') {
    return new PasskeyError('unsupported-algorithm', undefined, error);
  }

  if (code === 'ERROR_CEREMONY_ABORTED' || name === 'AbortError') {
    return new PasskeyError('cancelled', undefined, error);
  }

  if (name === 'NotAllowedError') {
    const { elapsedMs, timeoutMs } = ctx;
    // Allow a little slack: timers fire slightly early/late across browsers.
    if (elapsedMs !== undefined && timeoutMs !== undefined && elapsedMs >= timeoutMs - 1_000) {
      return new PasskeyError('timeout', undefined, error);
    }
    return new PasskeyError('cancelled', undefined, error);
  }

  if (name === 'NotSupportedError' || code === 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT' || code === 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT') {
    return new PasskeyError('no-authenticator', undefined, error);
  }

  if (name === 'TypeError' && /fetch|network/i.test(err?.message ?? '')) {
    return new PasskeyError('network', undefined, error);
  }

  return new PasskeyError('unknown', undefined, error);
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = normalizeApiUrl(getPublicEnv().apiUrl, endpoint);
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    throw new PasskeyApiError(FRIENDLY_MESSAGES.network);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new PasskeyApiError(
      body.error || `API request failed: ${response.statusText}`,
      response.status
    );
  }

  const result = await response.json();
  if (!result.success) {
    throw new PasskeyApiError(result.error || 'Request failed', response.status);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** Normalise standard base64 (as emitted by the backend) to base64url. */
export function toBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** COSE algorithm identifier for ES256 (ECDSA w/ SHA-256 on P-256). */
const COSE_ES256 = -7;

/**
 * Extract the P-256 affine coordinates from a public key returned by
 * `AuthenticatorAttestationResponse.getPublicKey()`, which is a DER encoded
 * SubjectPublicKeyInfo whose final 65 bytes are the uncompressed point
 * `0x04 || X || Y`. A raw 65-byte point is also accepted.
 */
export function extractP256Coordinates(publicKey: ArrayBuffer | Uint8Array): {
  publicKeyX: string;
  publicKeyY: string;
} {
  const bytes = publicKey instanceof Uint8Array ? publicKey : new Uint8Array(publicKey);
  if (bytes.length < 65) {
    throw new PasskeyError('unsupported-algorithm');
  }
  const point = bytes.slice(bytes.length - 65);
  if (point[0] !== 0x04) {
    throw new PasskeyError('unsupported-algorithm');
  }
  return {
    publicKeyX: bytesToHex(point.slice(1, 33)),
    publicKeyY: bytesToHex(point.slice(33, 65)),
  };
}

/** Read the big-endian signature counter from authenticator data. */
export function readSignCount(authenticatorData: ArrayBuffer | Uint8Array): number {
  const bytes =
    authenticatorData instanceof Uint8Array ? authenticatorData : new Uint8Array(authenticatorData);
  if (bytes.length < 37) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(33, false);
}

// ---------------------------------------------------------------------------
// Feature Detection
// ---------------------------------------------------------------------------

/** Check if WebAuthn is supported in the current browser. */
export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

/** Check if a user-verifying platform authenticator (biometric) is available. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/** Get a human-readable name for the platform authenticator on this device. */
export function getAuthenticatorName(): string {
  if (typeof navigator === 'undefined') return 'Platform Authenticator';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'Face ID / Touch ID';
  if (/Mac/.test(ua)) return 'Touch ID';
  if (/Android/.test(ua)) return 'Fingerprint / Face Unlock';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'Platform Authenticator';
}

/**
 * Detect everything the UI needs to offer the right registration options.
 * Never throws — unknown capabilities are reported as unavailable / `null`.
 */
export async function detectAuthenticatorCapabilities(): Promise<AuthenticatorCapabilities> {
  const webauthn = isWebAuthnSupported();
  if (!webauthn) {
    return {
      webauthn: false,
      platformAuthenticator: false,
      conditionalMediation: false,
      prf: false,
      platformLabel: getAuthenticatorName(),
    };
  }

  const [platformAuthenticator, conditionalMediation, prf] = await Promise.all([
    isPlatformAuthenticatorAvailable(),
    browserSupportsWebAuthnAutofill().catch(() => false),
    (async (): Promise<boolean | null> => {
      try {
        const getCaps = (
          PublicKeyCredential as unknown as {
            getClientCapabilities?: () => Promise<Record<string, boolean>>;
          }
        ).getClientCapabilities;
        if (typeof getCaps !== 'function') return null;
        const caps = await getCaps.call(PublicKeyCredential);
        return 'extension:prf' in caps ? Boolean(caps['extension:prf']) : null;
      } catch {
        return null;
      }
    })(),
  ]);

  return {
    webauthn,
    platformAuthenticator,
    conditionalMediation,
    prf,
    platformLabel: getAuthenticatorName(),
  };
}

/** Cancel any in-flight WebAuthn ceremony (e.g. when a modal is closed). */
export function cancelPasskeyCeremony(): void {
  try {
    WebAuthnAbortService.cancelCeremony();
  } catch {
    // Nothing in flight.
  }
}

// ---------------------------------------------------------------------------
// Nicknames (multi-key management)
// ---------------------------------------------------------------------------

export const PASSKEY_NICKNAME_MAX_LENGTH = 32;

/**
 * Validate a passkey nickname. Returns an error message, or `null` if valid.
 * Nicknames must be unique (case-insensitive) among the user's other keys.
 */
export function validatePasskeyNickname(
  nickname: string,
  existingNicknames: readonly (string | undefined)[] = []
): string | null {
  const trimmed = nickname.trim();
  if (!trimmed) return 'Give this passkey a name so you can recognise it later.';
  if (trimmed.length > PASSKEY_NICKNAME_MAX_LENGTH) {
    return `Keep the name to ${PASSKEY_NICKNAME_MAX_LENGTH} characters or fewer.`;
  }
  if (/[<>]/.test(trimmed)) return 'Names cannot contain < or >.';
  const lower = trimmed.toLowerCase();
  if (existingNicknames.some((n) => n?.trim().toLowerCase() === lower)) {
    return 'You already have a passkey with this name. Pick a different one.';
  }
  return null;
}

/** Suggest a unique default nickname such as "Touch ID" or "Security key 2". */
export function suggestPasskeyNickname(
  authenticator: AuthenticatorPreference,
  existingNicknames: readonly (string | undefined)[] = [],
  platformLabel: string = getAuthenticatorName()
): string {
  const base =
    authenticator === 'platform'
      ? platformLabel
      : authenticator === 'cross-platform'
        ? 'Security key'
        : 'Passkey';
  const taken = new Set(existingNicknames.map((n) => n?.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// ---------------------------------------------------------------------------
// PRF → Stellar key derivation
// ---------------------------------------------------------------------------

/**
 * Fixed PRF evaluation input. Changing this changes every derived Stellar
 * account, so it is versioned and must never be edited in place.
 */
const STELLAR_PRF_SALT = new TextEncoder().encode('web3-student-lab:sep-0010:stellar-ed25519:v1');

function prfExtensionInput() {
  return { prf: { eval: { first: STELLAR_PRF_SALT } } };
}

/** Pull the PRF output (32 bytes) out of client extension results, if present. */
function readPrfOutput(extensionResults: unknown): Uint8Array | null {
  const prf = (extensionResults as { prf?: { results?: { first?: unknown } } } | undefined)?.prf;
  const first = prf?.results?.first;
  if (!first) return null;
  if (typeof first === 'string') return new Uint8Array(base64URLStringToBuffer(first));
  if (first instanceof ArrayBuffer) return new Uint8Array(first);
  if (ArrayBuffer.isView(first)) {
    return new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  }
  return null;
}

function readPrfEnabled(extensionResults: unknown): boolean | undefined {
  return (extensionResults as { prf?: { enabled?: boolean } } | undefined)?.prf?.enabled;
}

type StellarKeypair = import('@stellar/stellar-sdk').Keypair;

/**
 * Turn PRF output into an ed25519 Stellar keypair. The PRF output is hashed
 * with a domain separator so the seed is bound to this purpose only.
 */
export async function keypairFromPrfOutput(prfOutput: Uint8Array): Promise<StellarKeypair> {
  if (prfOutput.length < 32) throw new PasskeyError('prf-unsupported');
  const { Keypair } = await import('@stellar/stellar-sdk');
  const domain = new TextEncoder().encode('stellar-seed');
  const input = new Uint8Array(domain.length + prfOutput.length);
  input.set(domain, 0);
  input.set(prfOutput, domain.length);
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  try {
    // Keypair copies the seed into its own Buffer, so ours can be wiped below.
    return Keypair.fromRawEd25519Seed(seed as unknown as Buffer);
  } finally {
    seed.fill(0);
    input.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

interface ServerRegistrationChallenge {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ alg: number; type: string }>;
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    userVerification?: string;
    residentKey?: string;
  };
  timeout?: number;
  attestation?: string;
  excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Build the browser-facing creation options from the server challenge,
 * applying the user's authenticator preference.
 *
 * - `platform`       → Touch ID / Face ID / Windows Hello on this device
 * - `cross-platform` → roaming FIDO2 keys (YubiKey) or a phone via hybrid
 * - `any`            → let the browser offer every option
 *
 * Only ES256 is requested because Stellar/Soroban verifies secp256r1.
 */
export function buildCreationOptions(
  server: ServerRegistrationChallenge,
  authenticator: AuthenticatorPreference
): PublicKeyCredentialCreationOptionsJSON {
  const hints: Array<'client-device' | 'security-key' | 'hybrid'> =
    authenticator === 'platform'
      ? ['client-device']
      : authenticator === 'cross-platform'
        ? ['security-key', 'hybrid']
        : [];

  return {
    challenge: toBase64Url(server.challenge),
    rp: server.rp,
    user: {
      id: toBase64Url(server.user.id),
      name: server.user.name,
      displayName: server.user.displayName,
    },
    pubKeyCredParams: [{ alg: COSE_ES256, type: 'public-key' }],
    authenticatorSelection: {
      ...(authenticator === 'any' ? {} : { authenticatorAttachment: authenticator }),
      userVerification: 'required',
      residentKey: 'preferred',
      requireResidentKey: false,
    },
    timeout: server.timeout ?? DEFAULT_TIMEOUT_MS,
    attestation: 'none',
    excludeCredentials: (server.excludeCredentials ?? []).map((cred) => ({
      id: toBase64Url(cred.id),
      type: 'public-key' as const,
      ...(cred.transports
        ? { transports: cred.transports as AuthenticatorTransportFuture[] }
        : {}),
    })),
    hints,
    extensions: {
      credProps: true,
      ...prfExtensionInput(),
    } as PublicKeyCredentialCreationOptionsJSON['extensions'],
  };
}

/**
 * Register a new passkey (platform biometric or hardware security key).
 *
 * 1. Requests a registration challenge from the server
 * 2. Runs the WebAuthn creation ceremony
 * 3. Extracts the P-256 public key and sends the attestation for verification
 *
 * Never throws: failures are returned as `{ success: false, error, errorCode }`
 * where `error` is safe to show directly to students.
 */
export async function registerPasskey(
  options: PasskeyRegistrationOptions
): Promise<RegistrationResult> {
  if (!isWebAuthnSupported()) {
    return failure('unsupported');
  }

  let authenticator: AuthenticatorPreference = options.authenticator ?? 'any';
  if (!options.authenticator) {
    authenticator = (await isPlatformAuthenticatorAvailable()) ? 'platform' : 'any';
  } else if (authenticator === 'platform' && !(await isPlatformAuthenticatorAvailable())) {
    return failure('no-authenticator');
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let startedAt = 0;

  try {
    const serverOptions = await apiRequest<ServerRegistrationChallenge>(
      '/passkey/register/challenge',
      {
        method: 'POST',
        body: JSON.stringify({
          userId: options.userId,
          userName: options.userName,
          userDisplayName: options.userDisplayName,
        }),
      }
    );

    const optionsJSON = buildCreationOptions(serverOptions, authenticator);
    timeoutMs = optionsJSON.timeout ?? DEFAULT_TIMEOUT_MS;

    startedAt = Date.now();
    const registration = await startRegistration({ optionsJSON });
    startedAt = 0;

    const { response } = registration;
    if (response.publicKeyAlgorithm !== undefined && response.publicKeyAlgorithm !== COSE_ES256) {
      throw new PasskeyError('unsupported-algorithm');
    }
    if (!response.publicKey) {
      throw new PasskeyError('unsupported-algorithm');
    }

    const { publicKeyX, publicKeyY } = extractP256Coordinates(
      base64URLStringToBuffer(response.publicKey)
    );

    const verified = await apiRequest<{
      credentialId: string;
      publicKeyX: string;
      publicKeyY: string;
      signCount: number;
      deviceName?: string;
    }>('/passkey/register/verify', {
      method: 'POST',
      body: JSON.stringify({
        userId: options.userId,
        challenge: serverOptions.challenge,
        credentialId: registration.rawId,
        attestationObject: response.attestationObject,
        clientDataJSON: response.clientDataJSON,
        publicKeyX,
        publicKeyY,
        signCount: 0,
      }),
    });

    const extensionResults = registration.clientExtensionResults;
    const prfOutput = readPrfOutput(extensionResults);
    let stellarPublicKey: string | undefined;
    if (prfOutput) {
      const keypair = await keypairFromPrfOutput(prfOutput);
      stellarPublicKey = keypair.publicKey();
      prfOutput.fill(0);
    }

    return {
      success: true,
      credentialId: verified.credentialId ?? registration.rawId,
      publicKeyX: verified.publicKeyX ?? publicKeyX,
      publicKeyY: verified.publicKeyY ?? publicKeyY,
      nickname: options.nickname?.trim() || suggestPasskeyNickname(authenticator),
      authenticatorAttachment: registration.authenticatorAttachment,
      transports: response.transports,
      prfEnabled: Boolean(prfOutput) || readPrfEnabled(extensionResults) === true,
      stellarPublicKey,
    };
  } catch (error) {
    const classified = classifyPasskeyError(error, {
      ceremony: 'registration',
      timeoutMs,
      elapsedMs: startedAt ? Date.now() - startedAt : undefined,
    });
    if (classified.code !== 'cancelled') {
      console.warn('Passkey registration failed:', classified.code, error);
    }
    return { success: false, error: classified.message, errorCode: classified.code };
  }
}

function failure(code: PasskeyErrorCode): RegistrationResult & AuthenticationResult {
  return { success: false, error: FRIENDLY_MESSAGES[code], errorCode: code };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

interface ServerAuthenticationChallenge {
  challenge: string;
  rpId?: string;
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
  userVerification?: string;
  timeout?: number;
}

function buildRequestOptions(
  challenge: string,
  {
    rpId,
    allowCredentialIds,
    timeout,
    withPrf,
  }: { rpId?: string; allowCredentialIds?: string[]; timeout?: number; withPrf?: boolean }
): PublicKeyCredentialRequestOptionsJSON {
  return {
    challenge: toBase64Url(challenge),
    ...(rpId ? { rpId } : {}),
    allowCredentials: (allowCredentialIds ?? []).map((id) => ({
      id: toBase64Url(id),
      type: 'public-key' as const,
    })),
    userVerification: 'required',
    timeout: timeout ?? DEFAULT_TIMEOUT_MS,
    ...(withPrf
      ? { extensions: prfExtensionInput() as PublicKeyCredentialRequestOptionsJSON['extensions'] }
      : {}),
  };
}

/**
 * Run a WebAuthn assertion, timing it so cancellations and timeouts can be
 * told apart.
 */
async function runAssertion(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON
): Promise<AuthenticationResponseJSON> {
  const startedAt = Date.now();
  try {
    return await startAuthentication({ optionsJSON });
  } catch (error) {
    throw classifyPasskeyError(error, {
      ceremony: 'authentication',
      timeoutMs: optionsJSON.timeout ?? DEFAULT_TIMEOUT_MS,
      elapsedMs: Date.now() - startedAt,
    });
  }
}

/**
 * Authenticate (or re-authenticate) with an existing passkey.
 * Never throws; see `RegistrationResult` for the error contract.
 */
export async function authenticatePasskey(
  options: PasskeyAuthenticationOptions = {}
): Promise<AuthenticationResult> {
  if (!isWebAuthnSupported()) {
    return failure('unsupported');
  }

  try {
    const serverOptions = await apiRequest<ServerAuthenticationChallenge>(
      '/passkey/authenticate/challenge',
      {
        method: 'POST',
        body: JSON.stringify({ userId: options.userId }),
      }
    );

    const allowIds = options.credentialId
      ? [options.credentialId]
      : (serverOptions.allowCredentials ?? []).map((c) => c.id);

    const assertion = await runAssertion(
      buildRequestOptions(serverOptions.challenge, {
        rpId: serverOptions.rpId,
        allowCredentialIds: allowIds,
        timeout: serverOptions.timeout,
      })
    );

    const signCount = readSignCount(base64URLStringToBuffer(assertion.response.authenticatorData));

    const result = await apiRequest<{
      verified: boolean;
      credentialId: string;
      signCount: number;
    }>('/passkey/authenticate/verify', {
      method: 'POST',
      body: JSON.stringify({
        challenge: serverOptions.challenge,
        credentialId: assertion.rawId,
        authenticatorData: assertion.response.authenticatorData,
        clientDataJSON: assertion.response.clientDataJSON,
        signature: assertion.response.signature,
        signCount,
      }),
    });

    return {
      success: true,
      credentialId: result.credentialId ?? assertion.rawId,
      verified: result.verified,
      signCount: result.signCount ?? signCount,
    };
  } catch (error) {
    const classified = classifyPasskeyError(error, { ceremony: 'authentication' });
    if (classified.code !== 'cancelled') {
      console.warn('Passkey authentication failed:', classified.code, error);
    }
    return { success: false, error: classified.message, errorCode: classified.code };
  }
}

// ---------------------------------------------------------------------------
// SEP-0010 challenge signing
// ---------------------------------------------------------------------------

export interface PasskeyStellarKey {
  keypair: StellarKeypair;
  credentialId: string;
  signCount: number;
}

/**
 * Biometric re-auth that derives the Stellar keypair bound to a passkey.
 *
 * @param challenge - bytes the assertion should commit to (e.g. a SEP-0010
 *   transaction hash). A random challenge is used when omitted.
 * @param credentialId - restrict the prompt to one registered passkey.
 * @throws PasskeyError
 */
export async function derivePasskeyStellarKey({
  challenge,
  credentialId,
  timeoutMs,
}: {
  challenge?: Uint8Array;
  credentialId?: string;
  timeoutMs?: number;
} = {}): Promise<PasskeyStellarKey> {
  if (!isWebAuthnSupported()) throw new PasskeyError('unsupported');

  const challengeBytes = challenge ?? crypto.getRandomValues(new Uint8Array(32));
  const assertion = await runAssertion(
    buildRequestOptions(bufferToBase64URLString(toArrayBuffer(challengeBytes)), {
      allowCredentialIds: credentialId ? [credentialId] : [],
      timeout: timeoutMs,
      withPrf: true,
    })
  );

  const prfOutput = readPrfOutput(assertion.clientExtensionResults);
  if (!prfOutput) throw new PasskeyError('prf-unsupported');

  try {
    const keypair = await keypairFromPrfOutput(prfOutput);
    return {
      keypair,
      credentialId: assertion.rawId,
      signCount: readSignCount(base64URLStringToBuffer(assertion.response.authenticatorData)),
    };
  } finally {
    prfOutput.fill(0);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export interface Sep10Transport {
  getChallenge(account: string): Promise<{ transaction: string; network_passphrase?: string }>;
  submit(signedTransaction: string): Promise<unknown>;
}

async function defaultSep10Transport(): Promise<Sep10Transport> {
  const { authAPI } = await import('./api');
  return {
    getChallenge: (account) => authAPI.getSep10Challenge(account),
    submit: (signed) => authAPI.verifySep10Challenge(signed),
  };
}

const DEFAULT_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

/**
 * Validate a SEP-0010 challenge before signing it: the first operation must be
 * a `manageData` op sourced from the client account, the server must be the
 * transaction source, and sequence number must be 0 so it can never be
 * submitted to the network.
 */
export async function validateSep10Challenge(
  transactionXdr: string,
  account: string,
  networkPassphrase: string
) {
  const { TransactionBuilder } = await import('@stellar/stellar-sdk');
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  } catch (err) {
    throw new PasskeyError('challenge-invalid', undefined, err);
  }
  if (!('operations' in tx) || !('sequence' in tx)) {
    throw new PasskeyError('challenge-invalid');
  }
  const [first] = tx.operations;
  if (
    tx.sequence !== '0' ||
    !first ||
    first.type !== 'manageData' ||
    first.source !== account ||
    tx.source === account
  ) {
    throw new PasskeyError('challenge-invalid');
  }
  return tx;
}

export interface Sep10SignInResult<TAuth = unknown> {
  account: string;
  credentialId: string;
  signedTransaction: string;
  auth: TAuth;
}

/**
 * Sign in to the backend SEP-0010 gateway with a passkey.
 *
 * When the Stellar account is already known (cached from an earlier
 * derivation), the SEP-0010 challenge is fetched first and its transaction
 * hash becomes the WebAuthn challenge, so the biometric assertion commits to
 * exactly the transaction being signed. Otherwise the key is derived first
 * (one biometric prompt either way).
 *
 * @throws PasskeyError
 */
export async function signInWithPasskeySep10<TAuth = unknown>({
  account,
  credentialId,
  transport,
}: {
  account?: string;
  credentialId?: string;
  transport?: Sep10Transport;
} = {}): Promise<Sep10SignInResult<TAuth>> {
  const api = transport ?? (await defaultSep10Transport());

  const fetchChallenge = async (acct: string) => {
    try {
      const res = await api.getChallenge(acct);
      if (!res?.transaction) throw new PasskeyError('server');
      const passphrase = res.network_passphrase || DEFAULT_NETWORK_PASSPHRASE;
      return { tx: await validateSep10Challenge(res.transaction, acct, passphrase) };
    } catch (err) {
      throw err instanceof PasskeyError ? err : new PasskeyError('server', undefined, err);
    }
  };

  let key: PasskeyStellarKey;
  let challengeTx: Awaited<ReturnType<typeof fetchChallenge>>['tx'];

  if (account) {
    ({ tx: challengeTx } = await fetchChallenge(account));
    key = await derivePasskeyStellarKey({
      challenge: new Uint8Array(challengeTx.hash()),
      credentialId,
    });
    if (key.keypair.publicKey() !== account) {
      throw new PasskeyError('credential-mismatch');
    }
  } else {
    key = await derivePasskeyStellarKey({ credentialId });
    ({ tx: challengeTx } = await fetchChallenge(key.keypair.publicKey()));
  }

  challengeTx.sign(key.keypair);
  const signedTransaction = challengeTx.toXDR();

  let auth: TAuth;
  try {
    auth = (await api.submit(signedTransaction)) as TAuth;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    throw new PasskeyError(
      status === undefined ? 'network' : 'server',
      status === 401
        ? 'The server rejected the passkey signature. The challenge may have expired — please try again.'
        : undefined,
      err
    );
  }

  return {
    account: key.keypair.publicKey(),
    credentialId: key.credentialId,
    signedTransaction,
    auth,
  };
}

// ---------------------------------------------------------------------------
// Credential Management
// ---------------------------------------------------------------------------

/** Get all credentials for a user. */
export async function getUserCredentials(userId: string): Promise<PasskeyCredential[]> {
  return apiRequest<PasskeyCredential[]>(`/passkey/credentials/${encodeURIComponent(userId)}`);
}

/** Get the count of credentials for a user. */
export async function getUserCredentialCount(userId: string): Promise<number> {
  const result = await apiRequest<{ count: number }>(
    `/passkey/credentials/${encodeURIComponent(userId)}/count`
  );
  return result.count;
}

/** Delete a credential on the server. */
export async function deleteCredential(credentialId: string): Promise<boolean> {
  const result = await apiRequest<{ deleted: boolean }>(
    `/passkey/credentials/${encodeURIComponent(credentialId)}`,
    { method: 'DELETE' }
  );
  return result.deleted;
}
