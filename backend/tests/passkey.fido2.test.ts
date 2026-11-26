import { createHash, createSign, generateKeyPairSync, randomBytes } from 'crypto';
import express from 'express';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import {
  CHALLENGE_TTL_SECONDS,
  PasskeyService,
} from '../src/auth/passkey.service.js';
import { createPasskeyRouter } from '../src/routes/passkey.routes.js';

// ---------------------------------------------------------------------------
// Minimal FIDO2 / WebAuthn Virtual Authenticator (ES256 / P-256)
// ---------------------------------------------------------------------------

const RP_ID = 'web3-student-lab.com';
const ORIGIN = `https://${RP_ID}`;

/** Minimal CBOR encoder sufficient for COSE EC2 P-256 key + "none" attestationObject. */
function cborEncodeUint(major: number, value: number): Buffer {
  const prefix = major << 5;
  if (value < 24) return Buffer.from([prefix | value]);
  if (value < 0x100) return Buffer.from([prefix | 24, value]);
  if (value < 0x10000) {
    const b = Buffer.alloc(3);
    b[0] = prefix | 25;
    b.writeUInt16BE(value, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = prefix | 26;
  b.writeUInt32BE(value, 1);
  return b;
}

function cborInt(n: number): Buffer {
  if (n >= 0) return cborEncodeUint(0, n);
  return cborEncodeUint(1, -1 - n);
}

function cborBytes(buf: Buffer): Buffer {
  return Buffer.concat([cborEncodeUint(2, buf.length), buf]);
}

function cborText(str: string): Buffer {
  const buf = Buffer.from(str, 'utf-8');
  return Buffer.concat([cborEncodeUint(3, buf.length), buf]);
}

function cborMap(entries: Array<[Buffer, Buffer]>): Buffer {
  return Buffer.concat([
    cborEncodeUint(5, entries.length),
    ...entries.flatMap(([k, v]) => [k, v]),
  ]);
}

interface VirtualAuthenticator {
  credentialId: Buffer;
  credentialIdBase64Url: string;
  privateKeyPem: string;
  cosePublicKey: Buffer;
  counter: number;
}

function createVirtualAuthenticator(initialCounter = 1): VirtualAuthenticator {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');

  // COSE_Key for ES256 (kty=2 EC2, alg=-7 ES256, crv=1 P-256, x, y)
  const cosePublicKey = cborMap([
    [cborInt(1), cborInt(2)],
    [cborInt(3), cborInt(-7)],
    [cborInt(-1), cborInt(1)],
    [cborInt(-2), cborBytes(x)],
    [cborInt(-3), cborBytes(y)],
  ]);

  const credentialId = randomBytes(32);
  return {
    credentialId,
    credentialIdBase64Url: credentialId.toString('base64url'),
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    cosePublicKey,
    counter: initialCounter,
  };
}

function buildRegistrationResponse(
  auth: VirtualAuthenticator,
  challenge: string,
  opts?: {
    origin?: string;
    rpId?: string;
    flags?: number;
    authenticatorAttachment?: 'platform' | 'cross-platform';
  }
) {
  const rpId = opts?.rpId ?? RP_ID;
  const origin = opts?.origin ?? ORIGIN;
  // UP (0x01) | UV (0x04) | AT (0x40) = 0x45
  const flags = opts?.flags ?? 0x45;

  const rpIdHash = createHash('sha256').update(rpId).digest();
  const flagsBuf = Buffer.from([flags]);
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(auth.counter, 0);

  const aaguid = Buffer.alloc(16, 0);
  const credIdLen = Buffer.alloc(2);
  credIdLen.writeUInt16BE(auth.credentialId.length, 0);

  const authData = Buffer.concat([
    rpIdHash,
    flagsBuf,
    counterBuf,
    aaguid,
    credIdLen,
    auth.credentialId,
    auth.cosePublicKey,
  ]);

  const attestationObject = cborMap([
    [cborText('fmt'), cborText('none')],
    [cborText('attStmt'), cborMap([])],
    [cborText('authData'), cborBytes(authData)],
  ]);

  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.create',
      challenge,
      origin,
      crossOrigin: false,
    }),
    'utf-8'
  );

  return {
    id: auth.credentialIdBase64Url,
    rawId: auth.credentialIdBase64Url,
    type: 'public-key' as const,
    authenticatorAttachment: opts?.authenticatorAttachment ?? 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: clientDataJSON.toString('base64url'),
      attestationObject: attestationObject.toString('base64url'),
      transports: ['internal' as const],
    },
  };
}

function buildAuthenticationResponse(
  auth: VirtualAuthenticator,
  challenge: string,
  opts?: {
    origin?: string;
    rpId?: string;
    flags?: number;
    counter?: number;
  }
) {
  const rpId = opts?.rpId ?? RP_ID;
  const origin = opts?.origin ?? ORIGIN;
  // UP (0x01) | UV (0x04) = 0x05
  const flags = opts?.flags ?? 0x05;
  const counter = opts?.counter ?? ++auth.counter;

  const rpIdHash = createHash('sha256').update(rpId).digest();
  const flagsBuf = Buffer.from([flags]);
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(counter, 0);

  const authenticatorData = Buffer.concat([rpIdHash, flagsBuf, counterBuf]);

  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin,
      crossOrigin: false,
    }),
    'utf-8'
  );

  const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
  const signedPayload = Buffer.concat([authenticatorData, clientDataHash]);

  const signer = createSign('SHA256');
  signer.update(signedPayload);
  signer.end();
  const signature = signer.sign(auth.privateKeyPem);

  return {
    id: auth.credentialIdBase64Url,
    rawId: auth.credentialIdBase64Url,
    type: 'public-key' as const,
    authenticatorAttachment: 'platform' as const,
    clientExtensionResults: {},
    response: {
      authenticatorData: authenticatorData.toString('base64url'),
      clientDataJSON: clientDataJSON.toString('base64url'),
      signature: signature.toString('base64url'),
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('BE-070: WebAuthn FIDO2 Relying Party Verification Engine', () => {
  let redis: any;
  let service: PasskeyService;
  let app: express.Express;

  beforeEach(() => {
    redis = new RedisMock();
    service = new PasskeyService({
      redis,
      config: {
        rpId: RP_ID,
        rpName: 'Web3 Student Lab',
        expectedOrigins: [ORIGIN],
        allowedAttachments: ['platform'],
        challengeTtlSeconds: CHALLENGE_TTL_SECONDS,
      },
    });
    app = express();
    app.use(express.json());
    app.use('/api/passkey', createPasskeyRouter(service));
  });

  afterEach(async () => {
    await redis.flushall();
  });

  it('stores registration challenges in Redis with a strict 120-second TTL and verifies FIDO2 registration', async () => {
    const auth = createVirtualAuthenticator(1);

    const challengeRes = await request(app)
      .post('/api/passkey/register/challenge')
      .send({
        userId: 'student-1',
        userName: 'alice@web3lab.edu',
        userDisplayName: 'Alice',
      })
      .expect(200);

    const challenge: string = challengeRes.body.data.challenge;
    expect(challenge).toBeTruthy();

    // Verify strict 120s TTL in Redis
    const ttl = await redis.ttl(`passkey:reg:challenge:student-1:${challenge}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);

    const regResponse = buildRegistrationResponse(auth, challenge);
    const verifyRes = await request(app)
      .post('/api/passkey/register/verify')
      .send({
        userId: 'student-1',
        challenge,
        response: regResponse,
        deviceName: 'MacBook Touch ID',
      })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.credentialId).toBe(auth.credentialIdBase64Url);
    expect(verifyRes.body.data.signCount).toBe(1);
  });

  it('rejects replayed or expired registration challenges with 401 Unauthorized', async () => {
    const auth = createVirtualAuthenticator(1);

    const challengeRes = await request(app)
      .post('/api/passkey/register/challenge')
      .send({
        userId: 'student-1',
        userName: 'alice@web3lab.edu',
        userDisplayName: 'Alice',
      })
      .expect(200);

    const challenge: string = challengeRes.body.data.challenge;
    const regResponse = buildRegistrationResponse(auth, challenge);

    // First use succeeds
    await request(app)
      .post('/api/passkey/register/verify')
      .send({ userId: 'student-1', challenge, response: regResponse })
      .expect(200);

    // Replay of the same challenge -> 401 Unauthorized
    const replayRes = await request(app)
      .post('/api/passkey/register/verify')
      .send({ userId: 'student-1', challenge, response: regResponse })
      .expect(401);

    expect(replayRes.body.success).toBe(false);
    expect(replayRes.body.code).toBe('CHALLENGE_EXPIRED_OR_REPLAYED');

    // Non-existent / expired challenge -> 401 Unauthorized
    const expiredRes = await request(app)
      .post('/api/passkey/register/verify')
      .send({ userId: 'student-1', challenge: 'expired-nonce-xyz', response: regResponse })
      .expect(401);

    expect(expiredRes.body.code).toBe('CHALLENGE_EXPIRED_OR_REPLAYED');
  });

  it('strictly enforces authenticatorAttachment during registration', async () => {
    const auth = createVirtualAuthenticator(1);

    const challengeRes = await request(app)
      .post('/api/passkey/register/challenge')
      .send({
        userId: 'student-2',
        userName: 'bob@web3lab.edu',
        userDisplayName: 'Bob',
      })
      .expect(200);

    const challenge: string = challengeRes.body.data.challenge;
    const regResponse = buildRegistrationResponse(auth, challenge, {
      authenticatorAttachment: 'cross-platform',
    });

    const verifyRes = await request(app)
      .post('/api/passkey/register/verify')
      .send({ userId: 'student-2', challenge, response: regResponse })
      .expect(400);

    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.code).toBe('INVALID_AUTHENTICATOR_ATTACHMENT');
  });

  it('rejects origin mismatch and missing User Verified (UV) flag', async () => {
    const auth = createVirtualAuthenticator(1);

    // 1. Origin mismatch
    const ch1 = (
      await request(app)
        .post('/api/passkey/register/challenge')
        .send({ userId: 'student-3', userName: 'c@web3lab.edu', userDisplayName: 'Carol' })
    ).body.data.challenge;

    const badOriginRes = await request(app)
      .post('/api/passkey/register/verify')
      .send({
        userId: 'student-3',
        challenge: ch1,
        response: buildRegistrationResponse(auth, ch1, { origin: 'https://evil.example.com' }),
      })
      .expect(400);

    expect(badOriginRes.body.code).toBe('VERIFICATION_FAILED');

    // 2. Missing UV flag (UP=1, UV=0, AT=1 => 0x41)
    const ch2 = (
      await request(app)
        .post('/api/passkey/register/challenge')
        .send({ userId: 'student-3', userName: 'c@web3lab.edu', userDisplayName: 'Carol' })
    ).body.data.challenge;

    const noUvRes = await request(app)
      .post('/api/passkey/register/verify')
      .send({
        userId: 'student-3',
        challenge: ch2,
        response: buildRegistrationResponse(auth, ch2, { flags: 0x41 }),
      })
      .expect(400);

    expect(noUvRes.body.code).toBe('VERIFICATION_FAILED');
  });

  it('verifies FIDO2 authentication, rejects replayed challenges with 401, and triggers immediate lockout on cloned authenticator counter regression', async () => {
    const auth = createVirtualAuthenticator(5);

    // Register credential with counter = 5
    const regCh = (
      await request(app)
        .post('/api/passkey/register/challenge')
        .send({ userId: 'student-4', userName: 'dave@web3lab.edu', userDisplayName: 'Dave' })
    ).body.data.challenge;

    await request(app)
      .post('/api/passkey/register/verify')
      .send({
        userId: 'student-4',
        challenge: regCh,
        response: buildRegistrationResponse(auth, regCh),
      })
      .expect(200);

    // Valid authentication with counter = 6
    const authCh1 = (
      await request(app)
        .post('/api/passkey/authenticate/challenge')
        .send({ userId: 'student-4' })
        .expect(200)
    ).body.data.challenge;

    const ttl = await redis.ttl(`passkey:auth:challenge:${authCh1}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);

    const authResp1 = buildAuthenticationResponse(auth, authCh1, { counter: 6 });
    const verify1 = await request(app)
      .post('/api/passkey/authenticate/verify')
      .send({ challenge: authCh1, response: authResp1 })
      .expect(200);

    expect(verify1.body.data.verified).toBe(true);
    expect(verify1.body.data.signCount).toBe(6);

    // Replay of authCh1 -> 401 Unauthorized
    const replayAuth = await request(app)
      .post('/api/passkey/authenticate/verify')
      .send({ challenge: authCh1, response: authResp1 })
      .expect(401);

    expect(replayAuth.body.code).toBe('CHALLENGE_EXPIRED_OR_REPLAYED');

    // Cloned authenticator with falling signature counter (counter = 4 < stored 6) -> 403 lockout
    const authCh2 = (
      await request(app)
        .post('/api/passkey/authenticate/challenge')
        .send({ userId: 'student-4' })
        .expect(200)
    ).body.data.challenge;

    const clonedResp = buildAuthenticationResponse(auth, authCh2, { counter: 4 });
    const lockoutRes = await request(app)
      .post('/api/passkey/authenticate/verify')
      .send({ challenge: authCh2, response: clonedResp })
      .expect(403);

    expect(lockoutRes.body.success).toBe(false);
    expect(lockoutRes.body.code).toBe('AUTHENTICATOR_CLONED_LOCKOUT');
    expect(await service.isCredentialLocked(auth.credentialIdBase64Url)).toBe(true);

    // Subsequent authentication attempt even with higher counter (counter = 10) is permanently blocked
    const authCh3 = (
      await request(app)
        .post('/api/passkey/authenticate/challenge')
        .send({ userId: 'student-4' })
        .expect(200)
    ).body.data.challenge;

    const afterLockoutResp = buildAuthenticationResponse(auth, authCh3, { counter: 10 });
    const blockedRes = await request(app)
      .post('/api/passkey/authenticate/verify')
      .send({ challenge: authCh3, response: afterLockoutResp })
      .expect(403);

    expect(blockedRes.body.code).toBe('AUTHENTICATOR_LOCKED');
  });
});
