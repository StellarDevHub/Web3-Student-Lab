import { createSessionToken } from '@/microfrontends/sandbox/protocol';
import {
  MFE_CHANNEL,
  MFE_PROTOCOL_VERSION,
  type HostEventEnvelope,
  type HostToWidgetEnvelope,
  type MicroFrontendHostContext,
  type MicroFrontendHostEvent,
  type MicroFrontendHostEvents,
  type MicroFrontendManifest,
  type MicroFrontendPermission,
  type MicroFrontendRpcMethod,
  type MicroFrontendWidgetEvents,
  type RpcErrorCode,
  type RpcParams,
  type RpcRequestEnvelope,
  type RpcResponseEnvelope,
  type RpcResult,
  type SecurityViolation,
  type WidgetEventEnvelope,
  type WidgetToHostEnvelope,
} from '@/types/microFrontend';

/**
 * Typed postMessage RPC bridge between the course host and a sandboxed
 * third-party widget iframe (FE-047).
 *
 * Every inbound message must pass, in order: source-window identity, exact
 * origin match, size limit, envelope shape, per-mount session token, rate
 * limit, method allowlist, granted permission, and per-method param
 * validation. Anything else is dropped and reported as a
 * {@link SecurityViolation}. There is deliberately no method that exposes
 * host DOM, storage, cookies, or credentials, so a widget cannot ask for them.
 */

const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;
const STELLAR_NETWORKS = new Set(['testnet', 'mainnet', 'futurenet']);

/** Methods reachable over the bridge and the permission each one requires. */
export const RPC_METHOD_PERMISSIONS: Record<MicroFrontendRpcMethod, MicroFrontendPermission | null> = {
  'wallet.getPublicKey': 'wallet:read',
  'wallet.signTransaction': 'wallet:sign',
  'progress.report': 'progress:report',
  'exercise.submitEvaluation': 'exercise:evaluate',
  'widget.resize': null,
};

const WIDGET_EVENTS = new Set<keyof MicroFrontendWidgetEvents>(['widget.ready', 'widget.error']);

/** Throw from a host handler to return a specific RPC error code to the widget. */
export class RpcHandlerError extends Error {
  readonly code: RpcErrorCode;

  constructor(code: RpcErrorCode, message: string) {
    super(message);
    this.name = 'RpcHandlerError';
    this.code = code;
  }
}

// ─── Manifest validation ─────────────────────────────────────────────────────

export interface ManifestValidationOptions {
  /** Registry of origins approved to serve course widgets. */
  allowedOrigins: readonly string[];
  /** The embedding page's origin; widgets on it are refused (see below). */
  hostOrigin: string;
  /** Permit `http://localhost:*` widgets — local development only. */
  allowInsecureLocalhost?: boolean;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * `sandbox="allow-scripts allow-same-origin"` only isolates a frame whose
 * document is on a *different* origin. Same-origin content with both flags
 * can reach `parent.document` and strip its own sandbox, so a widget served
 * from the host origin is always rejected.
 */
export function validateManifest(manifest: MicroFrontendManifest, options: ManifestValidationOptions): ValidationResult {
  let entry: URL;
  try {
    entry = new URL(manifest.entryUrl);
  } catch {
    return { ok: false, reason: `entryUrl "${manifest.entryUrl}" is not an absolute URL` };
  }

  const isLocalhost = entry.hostname === 'localhost' || entry.hostname === '127.0.0.1';
  if (entry.protocol !== 'https:' && !(options.allowInsecureLocalhost && isLocalhost && entry.protocol === 'http:')) {
    return { ok: false, reason: 'widgets must be served over https' };
  }
  if (entry.username || entry.password) {
    return { ok: false, reason: 'entryUrl must not embed credentials' };
  }
  if (entry.origin !== manifest.origin) {
    return { ok: false, reason: `entryUrl origin ${entry.origin} does not match manifest origin ${manifest.origin}` };
  }
  if (entry.origin === options.hostOrigin) {
    return { ok: false, reason: 'widgets must be served from a different origin than the host' };
  }
  if (!options.allowedOrigins.includes(entry.origin)) {
    return { ok: false, reason: `origin ${entry.origin} is not in the widget registry allowlist` };
  }
  const unknownPermission = manifest.permissions.find((permission) => !isKnownPermission(permission));
  if (unknownPermission) {
    return { ok: false, reason: `unknown permission "${unknownPermission}"` };
  }
  return { ok: true };
}

function isKnownPermission(value: string): value is MicroFrontendPermission {
  return Object.values(RPC_METHOD_PERMISSIONS).includes(value as MicroFrontendPermission);
}

// ─── Envelope parsing ────────────────────────────────────────────────────────

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** Narrow raw `MessageEvent.data` to a widget envelope without trusting its params yet. */
export function parseWidgetEnvelope(data: unknown): WidgetToHostEnvelope | null {
  if (!isPlainObject(data)) return null;
  if (data.channel !== MFE_CHANNEL || data.version !== MFE_PROTOCOL_VERSION) return null;
  if (data.token !== null && typeof data.token !== 'string') return null;

  if (data.kind === 'request') {
    if (typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 64) return null;
    if (typeof data.method !== 'string') return null;
    return data as unknown as RpcRequestEnvelope;
  }
  if (data.kind === 'event') {
    if (typeof data.event !== 'string' || !WIDGET_EVENTS.has(data.event as keyof MicroFrontendWidgetEvents)) {
      return null;
    }
    return data as unknown as WidgetEventEnvelope;
  }
  return null;
}

function approximateSize(data: unknown): number {
  try {
    return JSON.stringify(data)?.length ?? 0;
  } catch {
    // Cyclic or non-serialisable structured-clone data is never a valid envelope.
    return Number.POSITIVE_INFINITY;
  }
}

// ─── Param validation ────────────────────────────────────────────────────────

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const EXERCISE_ID_PATTERN = /^[\w.:-]{1,128}$/;

/** Returns an error message, or `null` when `params` are valid for `method`. */
export function validateRpcParams(method: MicroFrontendRpcMethod, params: unknown): string | null {
  if (!isPlainObject(params)) return 'params must be a plain object';

  switch (method) {
    case 'wallet.getPublicKey':
      return null;

    case 'wallet.signTransaction': {
      const { xdr, network, description } = params;
      if (typeof xdr !== 'string' || xdr.length === 0 || xdr.length > 32_768 || !BASE64_PATTERN.test(xdr)) {
        return 'xdr must be a base64 transaction envelope';
      }
      if (typeof network !== 'string' || !STELLAR_NETWORKS.has(network)) return 'network is invalid';
      if (typeof description !== 'string' || description.length === 0 || description.length > 280) {
        return 'description must be 1–280 characters';
      }
      return null;
    }

    case 'progress.report': {
      const { percent, checkpoint } = params;
      if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        return 'percent must be a number between 0 and 100';
      }
      if (checkpoint !== undefined && (typeof checkpoint !== 'string' || checkpoint.length > 120)) {
        return 'checkpoint must be a string of at most 120 characters';
      }
      return null;
    }

    case 'exercise.submitEvaluation': {
      const { exerciseId, passed, score, maxScore, details } = params;
      if (typeof exerciseId !== 'string' || !EXERCISE_ID_PATTERN.test(exerciseId)) return 'exerciseId is invalid';
      if (typeof passed !== 'boolean') return 'passed must be a boolean';
      if (typeof maxScore !== 'number' || !Number.isFinite(maxScore) || maxScore <= 0) {
        return 'maxScore must be a positive number';
      }
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > maxScore) {
        return 'score must be between 0 and maxScore';
      }
      if (details !== undefined) {
        if (!isPlainObject(details)) return 'details must be a plain object';
        const entries = Object.entries(details);
        if (entries.length > 32) return 'details may have at most 32 keys';
        const primitive = entries.every(
          ([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
        );
        if (!primitive) return 'details values must be primitives';
        if (approximateSize(details) > 4096) return 'details must serialise to at most 4KB';
      }
      return null;
    }

    case 'widget.resize': {
      const { height } = params;
      if (typeof height !== 'number' || !Number.isFinite(height) || height < 50 || height > 4000) {
        return 'height must be between 50 and 4000';
      }
      return null;
    }

    default:
      return 'unknown method';
  }
}

// ─── Host bridge ─────────────────────────────────────────────────────────────

export interface HostRpcCallContext {
  widgetId: string;
  origin: string;
}

export type HostRpcHandlers = {
  [M in MicroFrontendRpcMethod]?: (params: RpcParams<M>, context: HostRpcCallContext) => Promise<RpcResult<M>> | RpcResult<M>;
};

export interface HostRpcBridgeOptions {
  manifest: MicroFrontendManifest;
  /** Returns the iframe's `contentWindow` — the only source accepted. */
  getTarget: () => Window | null;
  /** Permissions granted by the host (intersection with the manifest's request is enforced). */
  grantedPermissions: MicroFrontendPermission[];
  context: Omit<MicroFrontendHostContext, 'grantedPermissions' | 'widgetId'>;
  handlers: HostRpcHandlers;
  onReady?: (payload: MicroFrontendWidgetEvents['widget.ready']) => void;
  onWidgetError?: (payload: MicroFrontendWidgetEvents['widget.error']) => void;
  onViolation?: (violation: SecurityViolation) => void;
  /** Token bucket: burst capacity and refill per second. */
  rateLimit?: { capacity: number; refillPerSecond: number };
  maxMessageBytes?: number;
  hostWindow?: Window;
}

export class HostRpcBridge {
  private readonly options: HostRpcBridgeOptions;
  private readonly granted: Set<MicroFrontendPermission>;
  private readonly hostWindow: Window;
  private token: string | null = null;
  private tokens: number;
  private lastRefill = Date.now();
  private started = false;

  constructor(options: HostRpcBridgeOptions) {
    this.options = options;
    this.hostWindow = options.hostWindow ?? window;
    // A widget never gets more than it asked for in its manifest.
    this.granted = new Set(options.grantedPermissions.filter((p) => options.manifest.permissions.includes(p)));
    this.tokens = options.rateLimit?.capacity ?? 20;
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.hostWindow.addEventListener('message', this.handleMessage);
  }

  public destroy(): void {
    this.started = false;
    this.token = null;
    this.hostWindow.removeEventListener('message', this.handleMessage);
  }

  public isConnected(): boolean {
    return this.token !== null;
  }

  public getGrantedPermissions(): MicroFrontendPermission[] {
    return Array.from(this.granted);
  }

  /** Push a typed host event to the widget (only after handshake). */
  public emit<E extends MicroFrontendHostEvent>(event: E, payload: MicroFrontendHostEvents[E]): void {
    if (!this.token) return;
    const envelope: HostEventEnvelope<E> = {
      channel: MFE_CHANNEL,
      version: MFE_PROTOCOL_VERSION,
      token: this.token,
      kind: 'event',
      event,
      payload,
    };
    this.post(envelope);
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    const target = this.options.getTarget();
    // Messages from any other window (other widgets, extensions, the host itself) are not ours.
    if (!target || event.source !== target) return;

    const { manifest } = this.options;
    if (event.origin !== manifest.origin) {
      this.violation('untrusted-origin', `message from ${event.origin}, expected ${manifest.origin}`, event.origin);
      return;
    }

    if (approximateSize(event.data) > (this.options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES)) {
      this.violation('payload-too-large', 'message exceeds the size limit', event.origin);
      return;
    }

    const envelope = parseWidgetEnvelope(event.data);
    if (!envelope) {
      this.violation('malformed-envelope', 'message is not a valid widget envelope', event.origin);
      return;
    }

    if (envelope.kind === 'event' && envelope.event === 'widget.ready') {
      // First load, or the widget reloaded itself: issue a fresh token either way.
      this.handshake(envelope.payload as MicroFrontendWidgetEvents['widget.ready']);
      return;
    }

    if (!this.token || envelope.token !== this.token) {
      this.violation('invalid-token', 'missing or stale session token', event.origin);
      return;
    }

    if (envelope.kind === 'event') {
      if (envelope.event === 'widget.error') {
        this.options.onWidgetError?.(envelope.payload as MicroFrontendWidgetEvents['widget.error']);
      }
      return;
    }

    void this.handleRequest(envelope, event.origin);
  };

  private handshake(payload: MicroFrontendWidgetEvents['widget.ready']): void {
    this.token = createSessionToken();
    this.emit('host.handshake', {
      token: this.token,
      context: {
        ...this.options.context,
        widgetId: this.options.manifest.id,
        grantedPermissions: this.getGrantedPermissions(),
      },
    });
    this.options.onReady?.(payload);
  }

  private async handleRequest(request: RpcRequestEnvelope, origin: string): Promise<void> {
    const method = request.method as MicroFrontendRpcMethod;

    if (!this.consumeRateToken()) {
      this.violation('rate-limited', `rate limit exceeded on ${String(method)}`, origin);
      this.respondError(request, 'RATE_LIMITED', 'Too many requests');
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(RPC_METHOD_PERMISSIONS, method)) {
      this.violation('method-not-allowed', `blocked call to "${String(method)}"`, origin);
      this.respondError(request, 'METHOD_NOT_ALLOWED', `Method "${String(method)}" is not exposed to widgets`);
      return;
    }

    const permission = RPC_METHOD_PERMISSIONS[method];
    if (permission && !this.granted.has(permission)) {
      this.violation('permission-denied', `${method} requires ${permission}`, origin);
      this.respondError(request, 'PERMISSION_DENIED', `Permission "${permission}" was not granted`);
      return;
    }

    const paramsError = validateRpcParams(method, request.params);
    if (paramsError) {
      this.respondError(request, 'INVALID_PARAMS', paramsError);
      return;
    }

    const handler = this.options.handlers[method] as unknown as
      | ((params: unknown, context: HostRpcCallContext) => Promise<unknown> | unknown)
      | undefined;
    if (!handler) {
      this.respondError(request, 'METHOD_NOT_ALLOWED', `Host does not implement "${method}"`);
      return;
    }

    try {
      const result = await handler(request.params, { widgetId: this.options.manifest.id, origin });
      // The widget may have reloaded (new token) or been unmounted while the handler awaited.
      if (!this.token || request.token !== this.token) return;
      this.post({ ...this.baseResponse(request), result } as RpcResponseEnvelope);
    } catch (error) {
      if (error instanceof RpcHandlerError) {
        this.respondError(request, error.code, error.message);
      } else {
        // Never leak host internals (stack traces, URLs) into third-party code.
        this.respondError(request, 'INTERNAL_ERROR', 'The host could not complete the request');
      }
    }
  }

  private baseResponse(request: RpcRequestEnvelope) {
    return {
      channel: MFE_CHANNEL,
      version: MFE_PROTOCOL_VERSION,
      token: this.token,
      kind: 'response' as const,
      id: request.id,
      method: request.method,
    };
  }

  private respondError(request: RpcRequestEnvelope, code: RpcErrorCode, message: string): void {
    this.post({ ...this.baseResponse(request), error: { code, message } } as RpcResponseEnvelope);
  }

  private post(envelope: HostToWidgetEnvelope): void {
    // Always target the manifest origin, never '*': if the frame navigated elsewhere, nothing is delivered.
    this.options.getTarget()?.postMessage(envelope, this.options.manifest.origin);
  }

  private consumeRateToken(): boolean {
    const capacity = this.options.rateLimit?.capacity ?? 20;
    const refill = this.options.rateLimit?.refillPerSecond ?? 10;
    const now = Date.now();
    this.tokens = Math.min(capacity, this.tokens + ((now - this.lastRefill) / 1000) * refill);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private violation(reason: SecurityViolation['reason'], detail: string, origin?: string): void {
    this.options.onViolation?.({ reason, detail, origin, at: Date.now() });
  }
}

// ─── Widget-side client ──────────────────────────────────────────────────────

export interface WidgetRpcClientOptions {
  /** Exact origin of the Web3 Student Lab host page. */
  hostOrigin: string;
  timeoutMs?: number;
  widgetVersion?: string;
}

export class WidgetRpcError extends Error {
  readonly code: RpcErrorCode;

  constructor(code: RpcErrorCode, message: string) {
    super(message);
    this.name = 'WidgetRpcError';
    this.code = code;
  }
}

type PendingCall = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/**
 * Reference client for widget authors. Publish it (or this file's protocol)
 * to third-party developers; it runs inside the widget iframe.
 */
export class WidgetRpcClient {
  private readonly options: WidgetRpcClientOptions;
  private token: string | null = null;
  private context: MicroFrontendHostContext | null = null;
  private counter = 0;
  private readonly pending = new Map<string, PendingCall>();
  private readonly listeners = new Map<MicroFrontendHostEvent, Set<(payload: unknown) => void>>();
  private readyResolvers: Array<(context: MicroFrontendHostContext) => void> = [];

  constructor(options: WidgetRpcClientOptions) {
    this.options = options;
    window.addEventListener('message', this.handleMessage);
  }

  /** Announce the widget and resolve once the host completes the handshake. */
  public connect(): Promise<MicroFrontendHostContext> {
    const ready = new Promise<MicroFrontendHostContext>((resolve) => this.readyResolvers.push(resolve));
    const envelope: WidgetEventEnvelope<'widget.ready'> = {
      channel: MFE_CHANNEL,
      version: MFE_PROTOCOL_VERSION,
      token: null,
      kind: 'event',
      event: 'widget.ready',
      payload: { protocolVersion: MFE_PROTOCOL_VERSION, widgetVersion: this.options.widgetVersion },
    };
    window.parent.postMessage(envelope, this.options.hostOrigin);
    return ready;
  }

  public getContext(): MicroFrontendHostContext | null {
    return this.context;
  }

  public call<M extends MicroFrontendRpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResult<M>> {
    if (!this.token) return Promise.reject(new WidgetRpcError('INVALID_REQUEST', 'Not connected to host'));

    const id = `${Date.now().toString(36)}-${++this.counter}`;
    const request: RpcRequestEnvelope<M> = {
      channel: MFE_CHANNEL,
      version: MFE_PROTOCOL_VERSION,
      token: this.token,
      kind: 'request',
      id,
      method,
      params,
    };

    return new Promise<RpcResult<M>>((resolve, reject) => {
      // Signing waits on a human approval, so give it far longer than other calls.
      const timeout = method === 'wallet.signTransaction' ? 5 * 60_000 : (this.options.timeoutMs ?? 10_000);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new WidgetRpcError('INTERNAL_ERROR', `${method} timed out`));
      }, timeout);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      window.parent.postMessage(request, this.options.hostOrigin);
    });
  }

  public on<E extends MicroFrontendHostEvent>(event: E, listener: (payload: MicroFrontendHostEvents[E]) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as (payload: unknown) => void);
    this.listeners.set(event, set);
    return () => set.delete(listener as (payload: unknown) => void);
  }

  public destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new WidgetRpcError('INTERNAL_ERROR', 'Client destroyed'));
    });
    this.pending.clear();
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    if (event.source !== window.parent || event.origin !== this.options.hostOrigin) return;
    if (!isPlainObject(event.data)) return;
    const data = event.data as unknown as HostToWidgetEnvelope;
    if (data.channel !== MFE_CHANNEL || data.version !== MFE_PROTOCOL_VERSION) return;

    if (data.kind === 'event') {
      if (data.event === 'host.handshake') {
        const payload = data.payload as MicroFrontendHostEvents['host.handshake'];
        this.token = payload.token;
        this.context = payload.context;
        this.readyResolvers.forEach((resolve) => resolve(payload.context));
        this.readyResolvers = [];
      } else if (data.token !== this.token) {
        return;
      }
      this.listeners.get(data.event)?.forEach((listener) => listener(data.payload));
      return;
    }

    if (data.token !== this.token) return;
    const pending = this.pending.get(data.id);
    if (!pending) return;
    this.pending.delete(data.id);
    clearTimeout(pending.timer);
    if (data.error) pending.reject(new WidgetRpcError(data.error.code, data.error.message));
    else pending.resolve(data.result);
  };
}
