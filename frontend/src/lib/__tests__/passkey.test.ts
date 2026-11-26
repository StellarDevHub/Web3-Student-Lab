// @vitest-environment node
// The Stellar SDK's ed25519 code rejects jsdom's cross-realm Uint8Array, so this
// suite runs in Node with `window` aliased to the global object.
import { Keypair, Networks, WebAuth } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sw = vi.hoisted(() => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  browserSupportsWebAuthn: vi.fn(() => true),
  platformAuthenticatorIsAvailable: vi.fn(async () => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
}));

vi.mock('@simplewebauthn/browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/browser')>();
  return { ...actual, ...sw };
});

import { WebAuthnError, bufferToBase64URLString } from '@simplewebauthn/browser';
import {
  PasskeyError,
  buildCreationOptions,
  classifyPasskeyError,
  derivePasskeyStellarKey,
  extractP256Coordinates,
  keypairFromPrfOutput,
  readSignCount,
  registerPasskey,
  signInWithPasskeySep10,
  suggestPasskeyNickname,
  toBase64Url,
  validatePasskeyNickname,
  type Sep10Transport,
} from '../passkey';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function domException(name: string, message = name) {
  const err = new Error(message);
  err.name = name;
  return err;
}

/** DER SubjectPublicKeyInfo for a P-256 key: 26-byte header + 0x04||X||Y. */
function fakeSpki(x: number, y: number): Uint8Array {
  const header = new Uint8Array(26).fill(0x30);
  const point = new Uint8Array(65);
  point[0] = 0x04;
  point.fill(x, 1, 33);
  point.fill(y, 33, 65);
  const out = new Uint8Array(91);
  out.set(header, 0);
  out.set(point, 26);
  return out;
}

const b64u = (bytes: Uint8Array) => bufferToBase64URLString(bytes.slice().buffer as ArrayBuffer);

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => data,
  } as Response;
}

const PRF_OUTPUT = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);

function assertionWithPrf(rawId = 'cred-1', prf: Uint8Array | null = PRF_OUTPUT) {
  const authData = new Uint8Array(37);
  authData[36] = 5; // signCount = 5
  return {
    id: rawId,
    rawId,
    type: 'public-key',
    response: {
      authenticatorData: b64u(authData),
      clientDataJSON: b64u(new TextEncoder().encode('{}')),
      signature: b64u(new Uint8Array(64).fill(1)),
    },
    clientExtensionResults: prf ? { prf: { results: { first: prf.slice().buffer } } } : {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', globalThis);
  sw.browserSupportsWebAuthn.mockReturnValue(true);
  sw.platformAuthenticatorIsAvailable.mockResolvedValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

describe('classifyPasskeyError', () => {
  it('treats an early NotAllowedError as a user cancellation', () => {
    const err = classifyPasskeyError(domException('NotAllowedError'), {
      elapsedMs: 2_000,
      timeoutMs: 60_000,
    });
    expect(err.code).toBe('cancelled');
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/closed before it finished/i);
  });

  it('treats a NotAllowedError at the timeout boundary as a timeout', () => {
    const err = classifyPasskeyError(domException('NotAllowedError'), {
      elapsedMs: 59_500,
      timeoutMs: 60_000,
    });
    expect(err.code).toBe('timeout');
    expect(err.message).toMatch(/timed out/i);
  });

  it('unwraps @simplewebauthn WebAuthnError causes', () => {
    const wrapped = new WebAuthnError({
      message: 'denied',
      code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
      cause: domException('NotAllowedError'),
    });
    expect(classifyPasskeyError(wrapped).code).toBe('cancelled');
  });

  it('maps previously-registered authenticators to a friendly duplicate message', () => {
    const wrapped = new WebAuthnError({
      message: 'previously registered',
      code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
      cause: domException('InvalidStateError'),
    });
    const err = classifyPasskeyError(wrapped, { ceremony: 'registration' });
    expect(err.code).toBe('already-registered');
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/already registered/i);
  });

  it('maps aborts and security errors', () => {
    expect(classifyPasskeyError(domException('AbortError')).code).toBe('cancelled');
    expect(classifyPasskeyError(domException('SecurityError')).code).toBe('invalid-domain');
    expect(classifyPasskeyError(new Error('???')).code).toBe('unknown');
  });

  it('passes PasskeyErrors through untouched', () => {
    const original = new PasskeyError('prf-unsupported');
    expect(classifyPasskeyError(original)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

describe('encoding helpers', () => {
  it('extracts P-256 coordinates from an SPKI public key', () => {
    const { publicKeyX, publicKeyY } = extractP256Coordinates(fakeSpki(0xaa, 0xbb));
    expect(publicKeyX).toBe('aa'.repeat(32));
    expect(publicKeyY).toBe('bb'.repeat(32));
  });

  it('rejects keys that are not uncompressed P-256 points', () => {
    expect(() => extractP256Coordinates(new Uint8Array(64))).toThrow(PasskeyError);
    expect(() => extractP256Coordinates(new Uint8Array(91))).toThrow(PasskeyError);
  });

  it('reads the big-endian sign counter', () => {
    const data = new Uint8Array(37);
    data.set([0x00, 0x00, 0x01, 0x02], 33);
    expect(readSignCount(data)).toBe(258);
    expect(readSignCount(new Uint8Array(10))).toBe(0);
  });

  it('normalises standard base64 to base64url', () => {
    expect(toBase64Url('ab+/cd==')).toBe('ab-_cd');
  });
});

// ---------------------------------------------------------------------------
// Nicknames
// ---------------------------------------------------------------------------

describe('passkey nicknames', () => {
  it('requires a unique, non-empty, bounded name', () => {
    expect(validatePasskeyNickname('  ')).toMatch(/give this passkey a name/i);
    expect(validatePasskeyNickname('x'.repeat(33))).toMatch(/32 characters/);
    expect(validatePasskeyNickname('Work YubiKey', ['work yubikey'])).toMatch(/already have/i);
    expect(validatePasskeyNickname('<b>')).toMatch(/cannot contain/i);
    expect(validatePasskeyNickname('Work YubiKey', ['Touch ID'])).toBeNull();
  });

  it('suggests unique default names per authenticator type', () => {
    expect(suggestPasskeyNickname('cross-platform')).toBe('Security key');
    expect(suggestPasskeyNickname('cross-platform', ['Security key'])).toBe('Security key 2');
    expect(suggestPasskeyNickname('cross-platform', ['Security key', 'security key 2'])).toBe(
      'Security key 3'
    );
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const serverRegistrationChallenge = {
  challenge: 'abc+def/ghi',
  rp: { id: 'web3-student-lab.com', name: 'Web3 Student Lab' },
  user: { id: 'dXNlcl8x', name: 'student@example.com', displayName: 'Student' },
  pubKeyCredParams: [
    { alg: -7, type: 'public-key' },
    { alg: -257, type: 'public-key' },
  ],
  authenticatorSelection: {
    authenticatorAttachment: 'platform',
    userVerification: 'required',
    residentKey: 'preferred',
  },
  timeout: 60000,
  attestation: 'none',
  excludeCredentials: [{ id: 'old+cred', type: 'public-key' }],
};

describe('buildCreationOptions', () => {
  it('targets security keys (YubiKey) for cross-platform registration', () => {
    const opts = buildCreationOptions(serverRegistrationChallenge, 'cross-platform');
    expect(opts.authenticatorSelection?.authenticatorAttachment).toBe('cross-platform');
    expect(opts.hints).toEqual(['security-key', 'hybrid']);
  });

  it('targets the built-in biometric sensor for platform registration', () => {
    const opts = buildCreationOptions(serverRegistrationChallenge, 'platform');
    expect(opts.authenticatorSelection?.authenticatorAttachment).toBe('platform');
    expect(opts.authenticatorSelection?.userVerification).toBe('required');
    expect(opts.hints).toEqual(['client-device']);
  });

  it('lets the browser choose for "any", requests ES256 only, and excludes existing keys', () => {
    const opts = buildCreationOptions(serverRegistrationChallenge, 'any');
    expect(opts.authenticatorSelection?.authenticatorAttachment).toBeUndefined();
    expect(opts.pubKeyCredParams).toEqual([{ alg: -7, type: 'public-key' }]);
    expect(opts.challenge).toBe('abc-def_ghi');
    expect(opts.excludeCredentials).toEqual([{ id: 'old-cred', type: 'public-key' }]);
    expect(opts.extensions).toMatchObject({ credProps: true, prf: { eval: {} } });
  });
});

describe('registerPasskey', () => {
  it('registers a hardware key and sends the P-256 coordinates for verification', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: serverRegistrationChallenge }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            credentialId: 'new-cred',
            publicKeyX: 'aa'.repeat(32),
            publicKeyY: 'bb'.repeat(32),
            signCount: 0,
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    sw.startRegistration.mockResolvedValue({
      id: 'new-cred',
      rawId: 'new-cred',
      type: 'public-key',
      authenticatorAttachment: 'cross-platform',
      clientExtensionResults: { prf: { enabled: true } },
      response: {
        attestationObject: 'att',
        clientDataJSON: 'cdj',
        transports: ['usb', 'nfc'],
        publicKey: b64u(fakeSpki(0xaa, 0xbb)),
        publicKeyAlgorithm: -7,
      },
    });

    const result = await registerPasskey({
      userId: 'user_1',
      userName: 'student@example.com',
      userDisplayName: 'Student',
      nickname: '  Work YubiKey ',
      authenticator: 'cross-platform',
    });

    expect(result).toMatchObject({
      success: true,
      credentialId: 'new-cred',
      nickname: 'Work YubiKey',
      authenticatorAttachment: 'cross-platform',
      transports: ['usb', 'nfc'],
      prfEnabled: true,
    });
    const optionsJSON = sw.startRegistration.mock.calls[0][0].optionsJSON;
    expect(optionsJSON.authenticatorSelection.authenticatorAttachment).toBe('cross-platform');

    const verifyBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(verifyBody).toMatchObject({
      userId: 'user_1',
      challenge: 'abc+def/ghi',
      credentialId: 'new-cred',
      publicKeyX: 'aa'.repeat(32),
      publicKeyY: 'bb'.repeat(32),
    });
  });

  it('derives the Stellar account immediately when PRF output is returned at creation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ success: true, data: serverRegistrationChallenge }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { credentialId: 'c' } }))
    );
    sw.startRegistration.mockResolvedValue({
      id: 'c',
      rawId: 'c',
      type: 'public-key',
      clientExtensionResults: { prf: { enabled: true, results: { first: PRF_OUTPUT.slice().buffer } } },
      response: {
        attestationObject: 'att',
        clientDataJSON: 'cdj',
        publicKey: b64u(fakeSpki(1, 2)),
        publicKeyAlgorithm: -7,
      },
    });

    const result = await registerPasskey({
      userId: 'u',
      userName: 'u@example.com',
      userDisplayName: 'U',
      authenticator: 'platform',
    });
    const expected = (await keypairFromPrfOutput(PRF_OUTPUT.slice())).publicKey();
    expect(result.stellarPublicKey).toBe(expected);
    expect(result.stellarPublicKey).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it('returns a friendly, retryable error when the biometric prompt is cancelled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ success: true, data: serverRegistrationChallenge }))
    );
    sw.startRegistration.mockRejectedValue(
      new WebAuthnError({
        message: 'The operation either timed out or was not allowed.',
        code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
        cause: domException('NotAllowedError'),
      })
    );

    const result = await registerPasskey({
      userId: 'u',
      userName: 'u@example.com',
      userDisplayName: 'U',
      authenticator: 'platform',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('cancelled');
    expect(result.error).not.toMatch(/NotAllowedError|timed out or was not allowed/);
  });

  it('refuses platform registration when no biometric sensor exists', async () => {
    sw.platformAuthenticatorIsAvailable.mockResolvedValue(false);
    const result = await registerPasskey({
      userId: 'u',
      userName: 'u@example.com',
      userDisplayName: 'U',
      authenticator: 'platform',
    });
    expect(result.errorCode).toBe('no-authenticator');
    expect(result.error).toMatch(/YubiKey/);
  });

  it('reports unsupported browsers without calling the server', async () => {
    sw.browserSupportsWebAuthn.mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await registerPasskey({ userId: 'u', userName: 'u', userDisplayName: 'u' });
    expect(result.errorCode).toBe('unsupported');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SEP-0010
// ---------------------------------------------------------------------------

describe('SEP-0010 signing with passkeys', () => {
  const serverKeypair = Keypair.random();
  const HOME_DOMAIN = 'web3-student-lab.com';
  const WEB_AUTH_DOMAIN = 'api.web3-student-lab.com';
  const passphrase = Networks.TESTNET;

  /** Mimics backend/src/auth/sep10.service.ts using the real Stellar SDK. */
  function makeGateway() {
    const submitted: string[] = [];
    const transport: Sep10Transport = {
      getChallenge: vi.fn(async (account: string) => ({
        transaction: WebAuth.buildChallengeTx(
          serverKeypair,
          account,
          HOME_DOMAIN,
          300,
          passphrase,
          WEB_AUTH_DOMAIN
        ),
        network_passphrase: passphrase,
      })),
      submit: vi.fn(async (signed: string) => {
        submitted.push(signed);
        const { clientAccountID } = WebAuth.readChallengeTx(
          signed,
          serverKeypair.publicKey(),
          passphrase,
          [HOME_DOMAIN],
          WEB_AUTH_DOMAIN
        );
        const signers = WebAuth.verifyChallengeTxThreshold(
          signed,
          serverKeypair.publicKey(),
          passphrase,
          1,
          [{ key: clientAccountID, weight: 1, type: 'ed25519_public_key' }],
          [HOME_DOMAIN],
          WEB_AUTH_DOMAIN
        );
        return { token: 'jwt-token', signers };
      }),
    };
    return { transport, submitted };
  }

  it('signs a challenge that the SEP-0010 verifier accepts', async () => {
    sw.startAuthentication.mockResolvedValue(assertionWithPrf('cred-1'));
    const { transport } = makeGateway();

    const result = await signInWithPasskeySep10<{ token: string; signers: string[] }>({
      transport,
    });

    const expectedAccount = (await keypairFromPrfOutput(PRF_OUTPUT.slice())).publicKey();
    expect(result.account).toBe(expectedAccount);
    expect(result.credentialId).toBe('cred-1');
    expect(result.auth.token).toBe('jwt-token');
    expect(result.auth.signers).toEqual([expectedAccount]);
    expect(transport.getChallenge).toHaveBeenCalledWith(expectedAccount);

    const options = sw.startAuthentication.mock.calls[0][0].optionsJSON;
    expect(options.userVerification).toBe('required');
    expect(options.extensions.prf.eval.first).toBeInstanceOf(Uint8Array);
  });

  it('binds the biometric assertion to the challenge hash when the account is known', async () => {
    const account = (await keypairFromPrfOutput(PRF_OUTPUT.slice())).publicKey();
    sw.startAuthentication.mockResolvedValue(assertionWithPrf('cred-1'));
    const { transport, submitted } = makeGateway();

    await signInWithPasskeySep10({ account, credentialId: 'cred-1', transport });

    const { TransactionBuilder } = await import('@stellar/stellar-sdk');
    const tx = TransactionBuilder.fromXDR(submitted[0], passphrase);
    const options = sw.startAuthentication.mock.calls[0][0].optionsJSON;
    expect(options.challenge).toBe(b64u(new Uint8Array(tx.hash())));
    expect(options.allowCredentials).toEqual([{ id: 'cred-1', type: 'public-key' }]);
  });

  it('rejects a passkey that derives a different account', async () => {
    sw.startAuthentication.mockResolvedValue(assertionWithPrf('cred-2'));
    const { transport } = makeGateway();
    const other = Keypair.random().publicKey();

    await expect(signInWithPasskeySep10({ account: other, transport })).rejects.toMatchObject({
      code: 'credential-mismatch',
    });
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('refuses to sign a challenge that is not a valid SEP-0010 transaction', async () => {
    sw.startAuthentication.mockResolvedValue(assertionWithPrf());
    const transport: Sep10Transport = {
      // Challenge built for a different client account than the passkey's.
      getChallenge: vi.fn(async () => ({
        transaction: WebAuth.buildChallengeTx(
          serverKeypair,
          Keypair.random().publicKey(),
          HOME_DOMAIN,
          300,
          passphrase,
          WEB_AUTH_DOMAIN
        ),
        network_passphrase: passphrase,
      })),
      submit: vi.fn(),
    };

    await expect(signInWithPasskeySep10({ transport })).rejects.toMatchObject({
      code: 'challenge-invalid',
    });
    expect(transport.submit).not.toHaveBeenCalled();
  });

  it('explains when the authenticator cannot provide PRF output', async () => {
    sw.startAuthentication.mockResolvedValue(assertionWithPrf('cred-1', null));
    await expect(derivePasskeyStellarKey()).rejects.toMatchObject({ code: 'prf-unsupported' });
  });

  it('surfaces a cancelled biometric re-auth as a friendly error', async () => {
    sw.startAuthentication.mockRejectedValue(domException('NotAllowedError'));
    const { transport } = makeGateway();
    const error = await signInWithPasskeySep10({ transport }).catch((e) => e);
    expect(error).toBeInstanceOf(PasskeyError);
    expect(error.code).toBe('cancelled');
    expect(transport.getChallenge).not.toHaveBeenCalled();
  });

  it('derives the same Stellar account from the same PRF output', async () => {
    const a = await keypairFromPrfOutput(PRF_OUTPUT.slice());
    const b = await keypairFromPrfOutput(PRF_OUTPUT.slice());
    expect(a.publicKey()).toBe(b.publicKey());
    await expect(keypairFromPrfOutput(new Uint8Array(16))).rejects.toMatchObject({
      code: 'prf-unsupported',
    });
  });
});
