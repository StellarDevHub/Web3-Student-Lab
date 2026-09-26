import { describe, it, expect } from 'vitest';

import {
  PROTOCOL_VERSION,
  buildEnvelope,
  createSessionToken,
  isAllowedLabOrigin,
  parseEnvelope,
  toPublicWalletContext,
  validateEnvelope,
} from '@/microfrontends/sandbox/protocol';

describe('createSessionToken', () => {
  it('produces a 32-character hex token', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is different on every call', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createSessionToken()));
    expect(tokens.size).toBe(50);
  });
});

describe('parseEnvelope', () => {
  it('accepts a well-shaped envelope', () => {
    const raw = { version: 1, type: 'lab:ready', token: null, payload: { ok: true } };
    expect(parseEnvelope(raw)).toEqual(raw);
  });

  it('rejects non-objects', () => {
    expect(parseEnvelope('just a string')).toBeNull();
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope(42)).toBeNull();
  });

  it('rejects an object missing required fields', () => {
    expect(parseEnvelope({ type: 'lab:ready' })).toBeNull();
    expect(parseEnvelope({ version: 1, type: 'lab:ready' })).toBeNull();
  });

  it('rejects a token that is neither null nor a string', () => {
    expect(parseEnvelope({ version: 1, type: 'lab:ready', token: 123, payload: {} })).toBeNull();
  });
});

describe('validateEnvelope', () => {
  it('allows lab:ready through with no token issued yet', () => {
    const envelope = buildEnvelope('lab:ready', null, {});
    expect(validateEnvelope(envelope, null)).toEqual({ ok: true });
  });

  it('rejects a malformed (null) envelope', () => {
    expect(validateEnvelope(null, 'sometoken').ok).toBe(false);
  });

  it('rejects a protocol version mismatch', () => {
    const envelope = buildEnvelope('lab:log', 'tok', {});
    envelope.version = PROTOCOL_VERSION + 1;
    expect(validateEnvelope(envelope, 'tok').ok).toBe(false);
  });

  it('rejects a non-ready message before the host has issued a token', () => {
    const envelope = buildEnvelope('lab:log', null, {});
    const result = validateEnvelope(envelope, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/token/);
  });

  it('rejects a message carrying the wrong token', () => {
    const envelope = buildEnvelope('lab:log', 'wrong-token', {});
    expect(validateEnvelope(envelope, 'expected-token').ok).toBe(false);
  });

  it('accepts a message carrying the correct token', () => {
    const envelope = buildEnvelope('lab:log', 'expected-token', { message: 'hi' });
    expect(validateEnvelope(envelope, 'expected-token')).toEqual({ ok: true });
  });
});

describe('isAllowedLabOrigin', () => {
  it('allows an origin on the list', () => {
    expect(isAllowedLabOrigin('https://labs.example.com', ['https://labs.example.com'])).toBe(true);
  });

  it('rejects an origin not on the list, including the opaque "null" origin unless explicitly allowed', () => {
    expect(isAllowedLabOrigin('https://evil.example.com', ['https://labs.example.com'])).toBe(false);
    expect(isAllowedLabOrigin('null', ['https://labs.example.com'])).toBe(false);
  });

  it('allows the opaque "null" origin when the host explicitly opts in (bundled srcdoc labs)', () => {
    expect(isAllowedLabOrigin('null', ['null'])).toBe(true);
  });
});

describe('toPublicWalletContext', () => {
  it('marks a wallet with a public key as connected', () => {
    const ctx = toPublicWalletContext({ network: 'testnet', publicKey: 'GABC...' });
    expect(ctx).toEqual({ network: 'testnet', publicKey: 'GABC...', connected: true });
  });

  it('marks a wallet with no public key as disconnected', () => {
    const ctx = toPublicWalletContext({ network: 'testnet', publicKey: null });
    expect(ctx.connected).toBe(false);
  });

  it('never includes a signer, key material, or anything beyond network/publicKey', () => {
    const ctx = toPublicWalletContext({ network: 'mainnet', publicKey: 'G123' });
    expect(Object.keys(ctx).sort()).toEqual(['connected', 'network', 'publicKey']);
  });
});

describe('buildEnvelope', () => {
  it('stamps the current protocol version', () => {
    const envelope = buildEnvelope('host:handshake', null, { token: 'abc' });
    expect(envelope.version).toBe(PROTOCOL_VERSION);
    expect(envelope.type).toBe('host:handshake');
  });
});
