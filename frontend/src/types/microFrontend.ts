/**
 * Typed contract for pluggable third-party course widgets (FE-047).
 *
 * A widget is a micro-frontend deployed by an external web3 community on its
 * own origin and embedded in a lesson through `MicroFrontendContainer`. The
 * host and widget only talk through the postMessage RPC described here.
 */

export const MFE_CHANNEL = 'w3sl:mfe' as const;
export const MFE_PROTOCOL_VERSION = 1 as const;

/** Capabilities a widget can request in its manifest; the host grants a subset. */
export type MicroFrontendPermission =
  | 'wallet:read'
  | 'wallet:sign'
  | 'progress:report'
  | 'exercise:evaluate';

export interface MicroFrontendManifest {
  /** Stable registry id, e.g. `soroswap-dex-demo`. */
  id: string;
  name: string;
  version: string;
  /** Publisher shown to students on signing prompts. */
  publisher: string;
  /** Absolute https URL of the widget entry document. */
  entryUrl: string;
  /** Exact origin the widget is served from; every message is checked against it. */
  origin: string;
  permissions: MicroFrontendPermission[];
  /** Initial iframe height in px; the widget may request resizes. */
  initialHeight?: number;
}

export type StellarNetwork = 'testnet' | 'mainnet' | 'futurenet';

/** Context handed to the widget at handshake — public data only, never secrets. */
export interface MicroFrontendHostContext {
  widgetId: string;
  courseId?: string;
  lessonId?: string;
  locale: string;
  theme: 'dark' | 'light';
  grantedPermissions: MicroFrontendPermission[];
}

// ─── RPC method map ──────────────────────────────────────────────────────────

export interface WalletPublicKeyResult {
  publicKey: string | null;
  network: StellarNetwork;
}

export interface SignTransactionParams {
  /** Base64 transaction envelope XDR. */
  xdr: string;
  network: StellarNetwork;
  /** Human-readable purpose shown in the host's approval dialog. */
  description: string;
}

export interface SignTransactionResult {
  signedXdr: string;
}

export interface ProgressReportParams {
  /** 0–100 */
  percent: number;
  checkpoint?: string;
}

export interface ExerciseEvaluationParams {
  exerciseId: string;
  passed: boolean;
  score: number;
  maxScore: number;
  /** Optional structured evidence (kept small; validated for size). */
  details?: Record<string, string | number | boolean | null>;
}

export interface ResizeParams {
  height: number;
}

/**
 * Widget → host request methods. `permission` is the capability that must be
 * granted for the call to reach the host handler; `null` means always allowed.
 */
export interface MicroFrontendRpcMethods {
  'wallet.getPublicKey': { params: Record<string, never>; result: WalletPublicKeyResult; permission: 'wallet:read' };
  'wallet.signTransaction': { params: SignTransactionParams; result: SignTransactionResult; permission: 'wallet:sign' };
  'progress.report': { params: ProgressReportParams; result: { accepted: boolean }; permission: 'progress:report' };
  'exercise.submitEvaluation': {
    params: ExerciseEvaluationParams;
    result: { recorded: boolean };
    permission: 'exercise:evaluate';
  };
  'widget.resize': { params: ResizeParams; result: { height: number }; permission: null };
}

export type MicroFrontendRpcMethod = keyof MicroFrontendRpcMethods;
export type RpcParams<M extends MicroFrontendRpcMethod> = MicroFrontendRpcMethods[M]['params'];
export type RpcResult<M extends MicroFrontendRpcMethod> = MicroFrontendRpcMethods[M]['result'];

/** Host → widget push events. */
export interface MicroFrontendHostEvents {
  'host.handshake': { token: string; context: MicroFrontendHostContext };
  'host.walletChanged': WalletPublicKeyResult;
  'host.themeChanged': { theme: 'dark' | 'light' };
}

/** Widget → host push events (no response). */
export interface MicroFrontendWidgetEvents {
  'widget.ready': { protocolVersion: number; widgetVersion?: string };
  'widget.error': { message: string };
}

export type MicroFrontendHostEvent = keyof MicroFrontendHostEvents;
export type MicroFrontendWidgetEvent = keyof MicroFrontendWidgetEvents;

// ─── Wire envelopes ──────────────────────────────────────────────────────────

interface EnvelopeBase {
  channel: typeof MFE_CHANNEL;
  version: typeof MFE_PROTOCOL_VERSION;
  /** Per-mount session token; `null` only on the widget's initial `widget.ready`. */
  token: string | null;
}

export interface RpcRequestEnvelope<M extends MicroFrontendRpcMethod = MicroFrontendRpcMethod> extends EnvelopeBase {
  kind: 'request';
  id: string;
  method: M;
  params: RpcParams<M>;
}

export type RpcErrorCode =
  | 'INVALID_REQUEST'
  | 'METHOD_NOT_ALLOWED'
  | 'PERMISSION_DENIED'
  | 'INVALID_PARAMS'
  | 'USER_REJECTED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface RpcError {
  code: RpcErrorCode;
  message: string;
}

export interface RpcResponseEnvelope<M extends MicroFrontendRpcMethod = MicroFrontendRpcMethod> extends EnvelopeBase {
  kind: 'response';
  id: string;
  method: M;
  result?: RpcResult<M>;
  error?: RpcError;
}

export interface HostEventEnvelope<E extends MicroFrontendHostEvent = MicroFrontendHostEvent> extends EnvelopeBase {
  kind: 'event';
  event: E;
  payload: MicroFrontendHostEvents[E];
}

export interface WidgetEventEnvelope<E extends MicroFrontendWidgetEvent = MicroFrontendWidgetEvent>
  extends EnvelopeBase {
  kind: 'event';
  event: E;
  payload: MicroFrontendWidgetEvents[E];
}

export type WidgetToHostEnvelope = RpcRequestEnvelope | WidgetEventEnvelope;
export type HostToWidgetEnvelope = RpcResponseEnvelope | HostEventEnvelope;

/** Security events surfaced to the host for logging / UI. */
export interface SecurityViolation {
  reason:
    | 'untrusted-origin'
    | 'foreign-source'
    | 'malformed-envelope'
    | 'invalid-token'
    | 'method-not-allowed'
    | 'permission-denied'
    | 'payload-too-large'
    | 'rate-limited'
    | 'invalid-manifest';
  detail: string;
  origin?: string;
  at: number;
}
