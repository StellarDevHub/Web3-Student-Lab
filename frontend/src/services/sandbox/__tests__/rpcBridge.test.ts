import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HostRpcBridge,
  RpcHandlerError,
  parseWidgetEnvelope,
  validateManifest,
  validateRpcParams,
} from '../rpcBridge';
import {
  MFE_CHANNEL,
  MFE_PROTOCOL_VERSION,
  type MicroFrontendManifest,
  type SecurityViolation,
} from '@/types/microFrontend';

const WIDGET_ORIGIN = 'https://widgets.example.org';
const HOST_ORIGIN = 'https://lab.example.com';

const manifest: MicroFrontendManifest = {
  id: 'dex-demo',
  name: 'DEX Demo',
  version: '1.0.0',
  publisher: 'Example DAO',
  entryUrl: `${WIDGET_ORIGIN}/dex/index.html`,
  origin: WIDGET_ORIGIN,
  permissions: ['wallet:read', 'progress:report'],
};

describe('validateManifest', () => {
  const options = { allowedOrigins: [WIDGET_ORIGIN], hostOrigin: HOST_ORIGIN };

  it('accepts an allowlisted cross-origin https widget', () => {
    expect(validateManifest(manifest, options)).toEqual({ ok: true });
  });

  it('rejects same-origin widgets, which could escape allow-same-origin sandboxing', () => {
    const result = validateManifest(
      { ...manifest, entryUrl: `${HOST_ORIGIN}/w.html`, origin: HOST_ORIGIN },
      { ...options, allowedOrigins: [HOST_ORIGIN] },
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/different origin/) });
  });

  it('rejects non-allowlisted, insecure, or mismatched origins', () => {
    expect(validateManifest(manifest, { ...options, allowedOrigins: [] }).ok).toBe(false);
    expect(
      validateManifest({ ...manifest, entryUrl: 'http://widgets.example.org/x', origin: 'http://widgets.example.org' }, options)
        .ok,
    ).toBe(false);
    expect(validateManifest({ ...manifest, origin: 'https://evil.example' }, options).ok).toBe(false);
  });
});

describe('validateRpcParams', () => {
  it('validates signing requests', () => {
    expect(validateRpcParams('wallet.signTransaction', { xdr: 'AAAA', network: 'testnet', description: 'Swap' })).toBeNull();
    expect(validateRpcParams('wallet.signTransaction', { xdr: '<script>', network: 'testnet', description: 'x' })).toMatch(
      /base64/,
    );
    expect(validateRpcParams('wallet.signTransaction', { xdr: 'AAAA', network: 'devnet', description: 'x' })).toMatch(
      /network/,
    );
  });

  it('validates exercise evaluations', () => {
    const valid = { exerciseId: 'swap-1', passed: true, score: 8, maxScore: 10 };
    expect(validateRpcParams('exercise.submitEvaluation', valid)).toBeNull();
    expect(validateRpcParams('exercise.submitEvaluation', { ...valid, score: 11 })).toMatch(/score/);
    expect(validateRpcParams('exercise.submitEvaluation', { ...valid, details: { nested: {} } })).toMatch(/primitives/);
  });
});

describe('parseWidgetEnvelope', () => {
  it('drops messages outside the channel', () => {
    expect(parseWidgetEnvelope({ type: 'something-else' })).toBeNull();
    expect(parseWidgetEnvelope('string')).toBeNull();
    expect(
      parseWidgetEnvelope({ channel: MFE_CHANNEL, version: MFE_PROTOCOL_VERSION, token: null, kind: 'event', event: 'host.handshake' }),
    ).toBeNull();
  });
});

describe('HostRpcBridge', () => {
  let target: { postMessage: ReturnType<typeof vi.fn> };
  let violations: SecurityViolation[];
  let bridge: HostRpcBridge;
  let listener: ((event: MessageEvent) => void) | null;
  const onProgress = vi.fn();
  const otherWindow = {};

  // A fake host window keeps the test independent of jsdom's MessageEvent source validation.
  const hostWindow = {
    addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
      listener = handler;
    },
    removeEventListener: () => {
      listener = null;
    },
  } as unknown as Window;

  const dispatch = (data: unknown, { origin = WIDGET_ORIGIN, source = target as unknown } = {}) =>
    listener?.({ data, origin, source } as MessageEvent);

  const lastPosted = () => target.postMessage.mock.calls.at(-1)?.[0];
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const handshake = () => {
    dispatch({
      channel: MFE_CHANNEL,
      version: MFE_PROTOCOL_VERSION,
      token: null,
      kind: 'event',
      event: 'widget.ready',
      payload: { protocolVersion: 1 },
    });
    return lastPosted().payload.token as string;
  };

  const request = (token: string | null, method: string, params: unknown, id = 'r1') => ({
    channel: MFE_CHANNEL,
    version: MFE_PROTOCOL_VERSION,
    token,
    kind: 'request',
    id,
    method,
    params,
  });

  beforeEach(() => {
    target = { postMessage: vi.fn() };
    violations = [];
    onProgress.mockReset();
    bridge = new HostRpcBridge({
      manifest,
      getTarget: () => target as unknown as Window,
      hostWindow,
      grantedPermissions: ['wallet:read', 'progress:report', 'wallet:sign'],
      context: { locale: 'en', theme: 'dark' },
      onViolation: (violation) => violations.push(violation),
      handlers: {
        'wallet.getPublicKey': () => ({ publicKey: 'GABC', network: 'testnet' }),
        'progress.report': (params) => {
          onProgress(params);
          return { accepted: true };
        },
        'wallet.signTransaction': () => {
          throw new RpcHandlerError('USER_REJECTED', 'no');
        },
      },
    });
    bridge.start();
  });

  afterEach(() => bridge.destroy());

  it('hands out a session token only to the iframe, posting to its exact origin', () => {
    const token = handshake();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'host.handshake' }), WIDGET_ORIGIN);
    // Grants are capped by what the manifest requested: wallet:sign was not requested.
    expect(lastPosted().payload.context.grantedPermissions).toEqual(['wallet:read', 'progress:report']);
  });

  it('answers typed requests and forwards progress', async () => {
    const token = handshake();
    dispatch(request(token, 'progress.report', { percent: 50 }));
    await flush();
    expect(onProgress).toHaveBeenCalledWith({ percent: 50 });
    expect(lastPosted()).toMatchObject({ kind: 'response', id: 'r1', result: { accepted: true } });
  });

  it('ignores messages from foreign windows and flags wrong origins', () => {
    handshake();
    target.postMessage.mockClear();
    dispatch(request(null, 'wallet.getPublicKey', {}), { source: otherWindow });
    expect(target.postMessage).not.toHaveBeenCalled();

    dispatch(request(null, 'wallet.getPublicKey', {}), { origin: 'https://evil.example' });
    expect(violations.at(-1)?.reason).toBe('untrusted-origin');
  });

  it('rejects stale tokens, unknown methods, and ungranted permissions', async () => {
    const token = handshake();

    dispatch(request('forged', 'wallet.getPublicKey', {}));
    expect(violations.at(-1)?.reason).toBe('invalid-token');

    dispatch(request(token, 'host.readCookies', {}, 'r2'));
    await flush();
    expect(violations.at(-1)?.reason).toBe('method-not-allowed');
    expect(lastPosted()).toMatchObject({ id: 'r2', error: { code: 'METHOD_NOT_ALLOWED' } });

    dispatch(request(token, 'wallet.signTransaction', { xdr: 'AAAA', network: 'testnet', description: 'x' }, 'r3'));
    await flush();
    expect(lastPosted()).toMatchObject({ id: 'r3', error: { code: 'PERMISSION_DENIED' } });
  });

  it('rate limits bursts', async () => {
    const token = handshake();
    for (let i = 0; i < 25; i++) dispatch(request(token, 'wallet.getPublicKey', {}, `b${i}`));
    await flush();
    expect(violations.some((violation) => violation.reason === 'rate-limited')).toBe(true);
  });
});
