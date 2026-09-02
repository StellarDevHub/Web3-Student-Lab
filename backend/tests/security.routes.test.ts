/**
 * Integration tests for backend/src/routes/security.routes.ts
 *
 * Strategy
 * ────────
 * We mount the security router on a minimal Express app so there is no DB,
 * Redis, or other infrastructure dependency.  The auth middleware is mocked
 * at the module level so we can simulate authenticated admin users, regular
 * users, and unauthenticated requests.
 *
 * Covers:
 *  - GET  /public-key           (public)
 *  - GET  /key-versions         (admin only)
 *  - POST /rotate-payloads      (admin only, batch validation, mixed versions)
 *  - POST /reload-keys          (admin only)
 *  - 401 / 403 on all admin routes when unauthenticated or non-admin
 */

import { describe, expect, it, beforeAll, afterAll, jest } from '@jest/globals';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import {
  EncryptionKeyManager,
  setEncryptionKeyManager,
  resetEncryptionKeyManager,
} from '../src/services/encryptionKeyManager.js';

// ---------------------------------------------------------------------------
// Key fixtures (same as .env.test)
// ---------------------------------------------------------------------------

const KEY_V1_HEX = '0000000000000000000000000000000000000000000000000000000000000001';
const KEY_V2_HEX = '0000000000000000000000000000000000000000000000000000000000000002';

// ---------------------------------------------------------------------------
// Mock the auth middleware BEFORE importing the router so the mock is in
// place when the module is first evaluated.
// ---------------------------------------------------------------------------

// We want fine-grained control per-test; expose a setter for the mock behaviour.
type AuthBehaviour = 'unauthenticated' | 'regular' | 'admin';
let authBehaviour: AuthBehaviour = 'admin';

jest.mock('../src/middleware/auth.js', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    if (authBehaviour === 'unauthenticated') {
      return _res.status(401).json({ status: 'error', message: 'Access token required' });
    }
    (req as Request & { user?: { id: string; email: string; role: string } }).user = {
      id: 'user-1',
      email: 'test@example.com',
      role: authBehaviour === 'admin' ? 'admin' : 'student',
    };
    next();
  },
}));

// ---------------------------------------------------------------------------
// Import router AFTER mocks are set up
// ---------------------------------------------------------------------------

// eslint-disable-next-line import/first
import securityRouter from '../src/routes/security.routes.js';
import { securityService } from '../src/services/securityService.js';
import { encryptPayload } from '../src/utils/encryption.js';

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use('/api/v1/security', securityRouter);

// ---------------------------------------------------------------------------
// Setup: inject a controlled EncryptionKeyManager with v1 + v2 keys
// ---------------------------------------------------------------------------

let v1Envelope: string;
let v2Envelope: string;

beforeAll(() => {
  // Set env vars so EncryptionKeyManager can load keys
  process.env['PAYLOAD_ENCRYPTION_KEY_v1'] = KEY_V1_HEX;
  process.env['PAYLOAD_ENCRYPTION_KEY_v2'] = KEY_V2_HEX;
  process.env['ENCRYPTION_ROTATION_BATCH_SIZE'] = '10';
  process.env['ENCRYPTION_EXPOSE_KEY_VERSIONS'] = 'true';

  resetEncryptionKeyManager();

  // Inject a fresh manager into securityService's internal ekm via the
  // singleton replacement so tests are isolated from any process state.
  const mgr = new EncryptionKeyManager();
  setEncryptionKeyManager(mgr);

  // Pre-build test envelopes
  v2Envelope = mgr.encrypt('current-secret');

  // Build a v1 envelope directly using the low-level helper
  const key1 = Buffer.from(KEY_V1_HEX, 'hex');
  v1Envelope = encryptPayload('old-secret', key1, 1);
});

afterAll(() => {
  resetEncryptionKeyManager();
});

// ---------------------------------------------------------------------------
// GET /public-key
// ---------------------------------------------------------------------------

describe('GET /api/v1/security/public-key', () => {
  it('returns the RSA public key and keyId', async () => {
    const res = await request(app).get('/api/v1/security/public-key').expect(200);

    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('keyId');
    expect(res.body.data).toHaveProperty('publicKey');
    expect(typeof res.body.data.publicKey).toBe('string');
    expect(res.body.data.publicKey).toContain('BEGIN PUBLIC KEY');
  });
});

// ---------------------------------------------------------------------------
// GET /key-versions
// ---------------------------------------------------------------------------

describe('GET /api/v1/security/key-versions', () => {
  it('returns key version metadata for an admin user', async () => {
    authBehaviour = 'admin';
    const res = await request(app).get('/api/v1/security/key-versions').expect(200);

    expect(res.body.status).toBe('success');
    expect(typeof res.body.data.activeVersion).toBe('number');
    expect(Array.isArray(res.body.data.versions)).toBe(true);

    const versions: Array<{ version: number; isActive: boolean }> = res.body.data.versions;
    const active = versions.find((v) => v.isActive);
    expect(active?.version).toBe(res.body.data.activeVersion);

    // No key material in response
    for (const v of versions) {
      const asAny = v as Record<string, unknown>;
      expect(asAny['keyBuffer']).toBeUndefined();
    }
  });

  it('returns 403 for a non-admin authenticated user', async () => {
    authBehaviour = 'regular';
    const res = await request(app).get('/api/v1/security/key-versions').expect(403);
    expect(res.body.status).toBe('error');
  });

  it('returns 401 for an unauthenticated request', async () => {
    authBehaviour = 'unauthenticated';
    await request(app).get('/api/v1/security/key-versions').expect(401);
  });
});

// ---------------------------------------------------------------------------
// POST /rotate-payloads
// ---------------------------------------------------------------------------

describe('POST /api/v1/security/rotate-payloads', () => {
  beforeAll(() => {
    authBehaviour = 'admin';
  });

  it('migrates a v1 envelope and skips an already-current v2 envelope', async () => {
    authBehaviour = 'admin';
    const res = await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({
        items: [
          { id: 'row-old', envelopeStr: v1Envelope },
          { id: 'row-new', envelopeStr: v2Envelope },
        ],
      })
      .expect(200);

    expect(res.body.status).toBe('success');
    const { processed, migrated, skipped, failed, results } = res.body.data;

    expect(processed).toBe(2);
    expect(migrated).toBe(1);
    expect(skipped).toBe(1);
    expect(failed).toBe(0);

    const oldRow = results.find((r: { id: string }) => r.id === 'row-old');
    const newRow = results.find((r: { id: string }) => r.id === 'row-new');

    expect(oldRow.migrated).toBe(true);
    expect(oldRow.previousVersion).toBe(1);
    expect(oldRow.currentVersion).toBe(2);
    expect(typeof oldRow.newEnvelope).toBe('string');

    expect(newRow.migrated).toBe(false);
    expect(newRow.currentVersion).toBe(2);
  });

  it('returns an error entry for a malformed envelope without aborting the batch', async () => {
    authBehaviour = 'admin';
    const res = await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({
        items: [
          { id: 'good', envelopeStr: v2Envelope },
          { id: 'bad', envelopeStr: 'this-is-not-valid-base64url-json' },
        ],
      })
      .expect(200);

    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.migrated + res.body.data.skipped).toBe(1);

    const badRow = res.body.data.results.find((r: { id: string }) => r.id === 'bad');
    expect(badRow).toHaveProperty('error');
    // Error message must not expose plaintext or key material
    expect(badRow.error).not.toContain(KEY_V1_HEX);
    expect(badRow.error).not.toContain(KEY_V2_HEX);
  });

  it('returns 400 when items array is missing', async () => {
    authBehaviour = 'admin';
    const res = await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({})
      .expect(400);

    expect(res.body.status).toBe('error');
    expect(res.body).toHaveProperty('details');
  });

  it('returns 400 when items array is empty', async () => {
    authBehaviour = 'admin';
    const res = await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({ items: [] })
      .expect(400);

    expect(res.body.status).toBe('error');
  });

  it('returns 400 when batch exceeds ENCRYPTION_ROTATION_BATCH_SIZE', async () => {
    authBehaviour = 'admin';
    const oversizedBatch = Array.from({ length: 11 }, (_, i) => ({
      id: `row-${i}`,
      envelopeStr: v2Envelope,
    }));

    const res = await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({ items: oversizedBatch })
      .expect(400);

    expect(res.body.status).toBe('error');
  });

  it('returns 403 for a non-admin user', async () => {
    authBehaviour = 'regular';
    const res = await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({ items: [{ id: 'x', envelopeStr: v2Envelope }] })
      .expect(403);

    expect(res.body.status).toBe('error');
  });

  it('returns 401 for an unauthenticated request', async () => {
    authBehaviour = 'unauthenticated';
    await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({ items: [{ id: 'x', envelopeStr: v2Envelope }] })
      .expect(401);
  });

  it('does not expose plaintext or key material in the response body', async () => {
    authBehaviour = 'admin';
    const res = await request(app)
      .post('/api/v1/security/rotate-payloads')
      .send({ items: [{ id: 'check', envelopeStr: v1Envelope }] })
      .expect(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('old-secret');
    expect(body).not.toContain(KEY_V1_HEX);
    expect(body).not.toContain(KEY_V2_HEX);
  });
});

// ---------------------------------------------------------------------------
// POST /reload-keys
// ---------------------------------------------------------------------------

describe('POST /api/v1/security/reload-keys', () => {
  it('returns the active version and loaded versions for an admin user', async () => {
    authBehaviour = 'admin';
    const res = await request(app)
      .post('/api/v1/security/reload-keys')
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(typeof res.body.data.activeVersion).toBe('number');
    expect(Array.isArray(res.body.data.loadedVersions)).toBe(true);
  });

  it('returns 403 for a non-admin user', async () => {
    authBehaviour = 'regular';
    await request(app).post('/api/v1/security/reload-keys').expect(403);
  });

  it('returns 401 for an unauthenticated request', async () => {
    authBehaviour = 'unauthenticated';
    await request(app).post('/api/v1/security/reload-keys').expect(401);
  });
});

// ---------------------------------------------------------------------------
// SecurityService delegation
// ---------------------------------------------------------------------------

describe('SecurityService symmetric API', () => {
  it('encryptField / decryptField round-trip', () => {
    const plaintext = 'github_token_xyzabc';
    const envelope = securityService.encryptField(plaintext);
    expect(securityService.decryptField(envelope)).toBe(plaintext);
  });

  it('decryptField handles a v1 envelope when v1 key is loaded', () => {
    const key1 = Buffer.from(KEY_V1_HEX, 'hex');
    const v1Env = encryptPayload('legacy-token', key1, 1);
    expect(securityService.decryptField(v1Env)).toBe('legacy-token');
  });

  it('listSymmetricKeyVersions returns metadata without key material', () => {
    const versions = securityService.listSymmetricKeyVersions();
    expect(Array.isArray(versions)).toBe(true);
    for (const v of versions) {
      const asAny = v as Record<string, unknown>;
      expect(asAny['keyBuffer']).toBeUndefined();
    }
  });

  it('rotateEnvelope migrates a v1 envelope to the active version', () => {
    const key1 = Buffer.from(KEY_V1_HEX, 'hex');
    const v1Env = encryptPayload('rotate-me', key1, 1);
    const result = securityService.rotateEnvelope(v1Env);

    expect(result.migrated).toBe(true);
    expect(result.previousVersion).toBe(1);
    expect(result.currentVersion).toBe(securityService.getActiveSymmetricKeyVersion());
    expect(securityService.decryptField(result.newEnvelope)).toBe('rotate-me');
  });
});
