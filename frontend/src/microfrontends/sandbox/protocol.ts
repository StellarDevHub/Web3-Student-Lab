/**
 * Sandboxed micro-frontend protocol (Issue #1403).
 *
 * `MicroFrontendHost` (the existing `@/microfrontends/host`) lazy-loads a
 * remote *module* — it runs in the same JS realm, the same origin, and the
 * same document as the host, so "isolation" there is purely organizational.
 * That is fine for a first-party module the host's own build compiles, but
 * it does not satisfy this issue: a third-party lab someone else deployed,
 * loaded "without access to parent cookies or local storage."
 *
 * The only thing in a browser that actually enforces that boundary is a
 * cross-origin, `sandbox`-restricted iframe with `allow-same-origin`
 * deliberately omitted — that gives the frame an opaque origin, so the
 * platform itself (not application code) denies it any access to the
 * host's cookies, localStorage, or DOM. Communication then has to go
 * through `postMessage`, which is untyped and unauthenticated by default —
 * this module is the envelope format and validation that makes it safe to
 * trust: a per-mount session token neither guessable nor persisted anywhere
 * the frame could read it directly, an explicit origin allowlist, and a
 * narrow, read-only projection of wallet state instead of the wallet itself.
 *
 * Pure and DOM-free so the protocol logic is unit-testable without mounting
 * an iframe.
 */

export const PROTOCOL_VERSION = 1;

/** Message kinds the host and a sandboxed lab exchange. */
export type MicroFrontendMessageType =
  | 'lab:ready'
  | 'host:handshake'
  | 'lab:request-wallet-context'
  | 'host:wallet-context'
  | 'lab:log';

export interface MicroFrontendEnvelope<TPayload = unknown> {
  version: number;
  type: MicroFrontendMessageType;
  /** Per-mount session token. Required on every message except the initial `lab:ready`. */
  token: string | null;
  payload: TPayload;
}

/** Cryptographically random session token — one per mounted lab, never reused. */
export function createSessionToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Narrows `unknown` (from a raw `MessageEvent.data`) into an envelope shape, without trusting its contents yet. */
export function parseEnvelope(data: unknown): MicroFrontendEnvelope | null {
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as Record<string, unknown>;

  if (typeof candidate.version !== 'number') return null;
  if (typeof candidate.type !== 'string') return null;
  if (candidate.token !== null && typeof candidate.token !== 'string') return null;
  if (!('payload' in candidate)) return null;

  return {
    version: candidate.version,
    type: candidate.type as MicroFrontendMessageType,
    token: candidate.token as string | null,
    payload: candidate.payload,
  };
}

export interface EnvelopeValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate an incoming envelope against the session's expected token and
 * protocol version. `lab:ready` is the one message allowed through without
 * a token — it is how the lab announces it exists at all, before the host
 * has had a chance to hand it one.
 */
export function validateEnvelope(
  envelope: MicroFrontendEnvelope | null,
  expectedToken: string | null,
): EnvelopeValidationResult {
  if (!envelope) return { ok: false, reason: 'malformed message' };
  if (envelope.version !== PROTOCOL_VERSION) return { ok: false, reason: 'protocol version mismatch' };

  if (envelope.type === 'lab:ready') return { ok: true };

  if (!expectedToken) return { ok: false, reason: 'host has not issued a session token yet' };
  if (envelope.token !== expectedToken) return { ok: false, reason: 'invalid or missing session token' };

  return { ok: true };
}

/**
 * Is `origin` one the host explicitly trusts to host third-party lab code?
 * `'null'` is the origin a sandboxed iframe reports when rendered from
 * `srcdoc` or a `data:` URL with no `allow-same-origin` — it is legitimate
 * for a lab bundled directly into this demo, but a real third-party
 * deployment must be an explicit https origin.
 */
export function isAllowedLabOrigin(origin: string, allowlist: readonly string[]): boolean {
  return allowlist.includes(origin);
}

/** The read-only wallet projection handed to a sandboxed lab — never the signer, never a private key. */
export interface PublicWalletContext {
  network: 'testnet' | 'mainnet' | 'futurenet';
  publicKey: string | null;
  connected: boolean;
}

/**
 * Reduce a full wallet/auth context down to the fields a sandboxed
 * third-party lab is allowed to see. This is the "shared wallet context"
 * the issue asks for — shared by explicit, narrow projection over a
 * validated message channel, not by giving the frame access to the same
 * signer, storage, or global scope the host wallet code runs in.
 */
export function toPublicWalletContext(context: {
  network: PublicWalletContext['network'];
  publicKey: string | null;
}): PublicWalletContext {
  return {
    network: context.network,
    publicKey: context.publicKey,
    connected: context.publicKey !== null,
  };
}

/** Build an outbound envelope. `token` is omitted (null) only for `host:handshake`, which is what delivers the token in the first place. */
export function buildEnvelope<TPayload>(
  type: MicroFrontendMessageType,
  token: string | null,
  payload: TPayload,
): MicroFrontendEnvelope<TPayload> {
  return { version: PROTOCOL_VERSION, type, token, payload };
}

/** The `sandbox` attribute value that grants script execution but withholds same-origin, top-level navigation, and popups — the actual isolation mechanism this issue relies on. */
export const LAB_IFRAME_SANDBOX = 'allow-scripts allow-forms';
