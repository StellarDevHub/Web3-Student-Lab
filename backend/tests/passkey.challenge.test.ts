/**
 * Regression tests for the passkey challenge encoding bug.
 *
 * The service used to issue challenges in standard base64 (`+`, `/`) while
 * browsers echo them in clientDataJSON as unpadded base64url (`-`, `_`), and
 * the routes sent the client a *padded* copy that no longer matched the Redis
 * key. Roughly three in four registrations/sign-ins failed with
 * "Challenge mismatch" or "Challenge not found or expired".
 */
import { createHash } from 'crypto';

// ── In-memory Redis ─────────────────────────────────────────────────────────
const mockStore = new Map<string, string>();
const mockSets = new Map<string, Set<string>>();

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      mockStore.set(key, value);
      return 'OK';
    }),
    set: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    del: jest.fn(async (key: string) => (mockStore.delete(key) ? 1 : 0)),
    sadd: jest.fn(async (key: string, member: string) => {
      const set = mockSets.get(key) ?? new Set<string>();
      set.add(member);
      mockSets.set(key, set);
      return 1;
    }),
    smembers: jest.fn(async (key: string) => Array.from(mockSets.get(key) ?? [])),
    srem: jest.fn(async () => 1),
  })),
}));

// Prisma is unavailable in unit tests: every call rejects so the service
// falls back to Redis, as it does in production when the DB is down.
jest.mock('../src/db/index.js', () => {
  const unavailable = () => Promise.reject(new Error('db unavailable'));
  return {
    __esModule: true,
    default: {
      passkeyCredential: {
        findMany: jest.fn(unavailable),
        findUnique: jest.fn(unavailable),
        upsert: jest.fn(unavailable),
        delete: jest.fn(unavailable),
        count: jest.fn(unavailable),
      },
    },
  };
});

import { PasskeyService, normalizeChallenge } from '../src/services/passkey.service.js';

const RP_ID = 'web3-student-lab.com';
const ORIGIN = `https://${RP_ID}`;
const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

/** What a browser puts in clientDataJSON for a given challenge buffer. */
function clientDataJSON(type: 'webauthn.create' | 'webauthn.get', challenge: Buffer) {
  return b64url(JSON.stringify({ type, origin: ORIGIN, challenge: b64url(challenge), crossOrigin: false }));
}

/** Authenticator data: rpIdHash(32) | flags(1: UP+UV) | signCount(4). */
function authenticatorData(signCount = 1) {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(signCount);
  return Buffer.concat([createHash('sha256').update(RP_ID).digest(), Buffer.from([0x05]), count]);
}

/**
 * Serialise options exactly like routes/passkey.routes.ts does, so the test
 * exercises the real round trip (route JSON → client → verify).
 */
function routeChallenge(buf: Buffer) {
  return buf.toString('base64url');
}

/** Generate options until the challenge contains `-` or `_` (the failing case). */
async function registrationWithUrlSafeChars(service: PasskeyService, userId: string) {
  for (let i = 0; i < 50; i++) {
    const options = await service.generateRegistrationChallenge(userId, 'student@example.com', 'Student');
    if (/[-_]/.test(routeChallenge(options.challenge))) return options;
  }
  throw new Error('could not produce a challenge with url-safe characters');
}

async function authenticationWithUrlSafeChars(service: PasskeyService) {
  for (let i = 0; i < 50; i++) {
    const options = await service.generateAuthenticationChallenge();
    if (/[-_]/.test(routeChallenge(options.challenge))) return options;
  }
  throw new Error('could not produce a challenge with url-safe characters');
}

const X = 'aa'.repeat(32);
const Y = 'bb'.repeat(32);

beforeEach(() => {
  mockStore.clear();
  mockSets.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('normalizeChallenge', () => {
  it('maps every base64 flavour to unpadded base64url', () => {
    expect(normalizeChallenge('ab+/cd==')).toBe('ab-_cd');
    expect(normalizeChallenge('ab-_cd')).toBe('ab-_cd');
    expect(normalizeChallenge(' ab-_cd= ')).toBe('ab-_cd');
  });
});

describe('passkey registration challenge round trip', () => {
  it('issues unpadded base64url challenges and stores them under that key', async () => {
    const service = new PasskeyService();
    const options = await service.generateRegistrationChallenge('user-1', 'student@example.com', 'Student');
    const sent = routeChallenge(options.challenge);

    expect(sent).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mockStore.has(`passkey_reg:user-1:${sent}`)).toBe(true);
  });

  it('verifies a browser registration whose challenge contains - or _', async () => {
    const service = new PasskeyService();
    const options = await registrationWithUrlSafeChars(service, 'user-2');

    const result = await service.verifyRegistration('user-2', routeChallenge(options.challenge), {
      credentialId: 'cred-1',
      attestationObject: authenticatorData(0).toString('base64'),
      clientDataJSON: clientDataJSON('webauthn.create', options.challenge),
      publicKeyX: X,
      publicKeyY: Y,
      signCount: 0,
    });

    expect(result.credentialId).toBe('cred-1');
    // The used challenge is consumed.
    expect(mockStore.has(`passkey_reg:user-2:${routeChallenge(options.challenge)}`)).toBe(false);
  });

  it('accepts the challenge echoed back as padded standard base64 (legacy clients)', async () => {
    const service = new PasskeyService();
    const options = await registrationWithUrlSafeChars(service, 'user-3');
    const padded = options.challenge.toString('base64');
    expect(padded).toMatch(/=$/);

    await expect(
      service.verifyRegistration('user-3', padded, {
        credentialId: 'cred-2',
        attestationObject: authenticatorData(0).toString('base64'),
        clientDataJSON: clientDataJSON('webauthn.create', options.challenge),
        publicKeyX: X,
        publicKeyY: Y,
        signCount: 0,
      })
    ).resolves.toMatchObject({ credentialId: 'cred-2' });
  });

  it('still rejects a clientDataJSON signed over a different challenge', async () => {
    const service = new PasskeyService();
    const options = await service.generateRegistrationChallenge('user-4', 'student@example.com', 'Student');

    await expect(
      service.verifyRegistration('user-4', routeChallenge(options.challenge), {
        credentialId: 'cred-3',
        attestationObject: authenticatorData(0).toString('base64'),
        clientDataJSON: clientDataJSON('webauthn.create', Buffer.alloc(32, 7)),
        publicKeyX: X,
        publicKeyY: Y,
        signCount: 0,
      })
    ).rejects.toThrow('Challenge mismatch');
  });

  it('rejects unknown or replayed challenges', async () => {
    const service = new PasskeyService();
    await expect(
      service.verifyRegistration('user-5', b64url(Buffer.alloc(32, 1)), {
        credentialId: 'cred-4',
        attestationObject: authenticatorData(0).toString('base64'),
        clientDataJSON: clientDataJSON('webauthn.create', Buffer.alloc(32, 1)),
        publicKeyX: X,
        publicKeyY: Y,
        signCount: 0,
      })
    ).rejects.toThrow('Challenge not found or expired');
  });
});

describe('passkey authentication challenge round trip', () => {
  it('verifies a browser assertion whose challenge contains - or _', async () => {
    const service = new PasskeyService();
    // Register a credential directly through the mockStore.
    const regOptions = await service.generateRegistrationChallenge('user-6', 'student@example.com', 'Student');
    await service.verifyRegistration('user-6', routeChallenge(regOptions.challenge), {
      credentialId: 'cred-auth',
      attestationObject: authenticatorData(0).toString('base64'),
      clientDataJSON: clientDataJSON('webauthn.create', regOptions.challenge),
      publicKeyX: X,
      publicKeyY: Y,
      signCount: 0,
    });

    const options = await authenticationWithUrlSafeChars(service);
    const sent = routeChallenge(options.challenge);
    expect(mockStore.has(`passkey_auth:${sent}`)).toBe(true);

    const result = await service.verifyAuthentication(sent, {
      credentialId: 'cred-auth',
      authenticatorData: authenticatorData(1).toString('base64'),
      clientDataJSON: clientDataJSON('webauthn.get', options.challenge),
      signature: Buffer.alloc(64, 9).toString('base64'),
      signCount: 1,
    });

    expect(result).toMatchObject({ verified: true, credentialId: 'cred-auth' });
    expect(mockStore.has(`passkey_auth:${sent}`)).toBe(false);
  });

  it('rejects an assertion over a different challenge', async () => {
    const service = new PasskeyService();
    const options = await service.generateAuthenticationChallenge();
    await expect(
      service.verifyAuthentication(routeChallenge(options.challenge), {
        credentialId: 'missing',
        authenticatorData: authenticatorData(1).toString('base64'),
        clientDataJSON: clientDataJSON('webauthn.get', Buffer.alloc(32, 3)),
        signature: Buffer.alloc(64, 9).toString('base64'),
        signCount: 1,
      })
    ).rejects.toThrow('Challenge mismatch');
  });
});
