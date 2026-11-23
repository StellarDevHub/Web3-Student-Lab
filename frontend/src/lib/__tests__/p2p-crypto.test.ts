import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptP2PMessage,
  encryptP2PMessage,
  estimateEncryptedPayloadSize,
  fingerprintP2PIdentity,
  getOrCreateConversationKey,
  getOrCreateP2PIdentity,
  resetP2PIdentity,
  verifyP2PIdentity,
} from '../p2p-crypto';

describe('p2p-crypto', () => {
  beforeEach(async () => {
    await resetP2PIdentity().catch(() => undefined);
  });

  it('creates a stable non-extractable local identity with a verifiable fingerprint', async () => {
    const identity = await getOrCreateP2PIdentity();
    const secondRead = await getOrCreateP2PIdentity();

    expect(identity.keyId).toBe(secondRead.keyId);
    expect(await fingerprintP2PIdentity(identity)).toBe(identity.keyId);
    expect(await verifyP2PIdentity(identity)).toBe(true);
  });

  it('rejects tampered public identities before deriving a conversation key', async () => {
    const identity = await getOrCreateP2PIdentity();
    const originalX = identity.publicKeyJwk.x ?? '';
    const lastChar = originalX.slice(-1);
    const differentChar = lastChar === 'A' ? 'B' : 'A';
    const tampered = {
      ...identity,
      publicKeyJwk: {
        ...identity.publicKeyJwk,
        x: `${originalX.slice(0, -1)}${differentChar}`,
      },
    };

    expect(await verifyP2PIdentity(tampered)).toBe(false);
    await expect(encryptP2PMessage(tampered, 'hello')).rejects.toThrow(/fingerprint/i);
  });

  it('rejects unsupported peer curves and empty plaintext', async () => {
    const identity = await getOrCreateP2PIdentity();

    await expect(encryptP2PMessage(identity, '   ')).rejects.toThrow(/empty/i);
    expect(
      await verifyP2PIdentity({
        ...identity,
        curve: 'P-384' as 'P-256',
      })
    ).toBe(false);
    await expect(
      encryptP2PMessage(
        {
          ...identity,
          curve: 'P-384' as 'P-256',
        },
        'hello'
      )
    ).rejects.toThrow(/curve/i);
  });

  it('encrypts and decrypts authenticated messages without exposing plaintext in the payload', async () => {
    const identity = await getOrCreateP2PIdentity();
    const payload = await encryptP2PMessage(identity, 'private study note');
    const plaintext = await decryptP2PMessage(identity, payload);

    expect(plaintext).toBe('private study note');
    expect(payload.ciphertext).not.toContain('private study note');
    expect(payload.iv.length).toBeGreaterThan(10);
    expect(estimateEncryptedPayloadSize(payload)).toBeGreaterThan(payload.ciphertext.length);
  });

  it('creates and reuses a stored conversation key', async () => {
    const identity = await getOrCreateP2PIdentity();
    await resetP2PIdentity();

    const first = await getOrCreateConversationKey(identity);
    const second = await getOrCreateConversationKey(identity);

    expect(first.conversationId).toBe(second.conversationId);
    expect(first.key.extractable).toBe(false);
    expect(second.key.extractable).toBe(false);
  });

  it('rejects authenticated metadata tampering', async () => {
    const identity = await getOrCreateP2PIdentity();
    const payload = await encryptP2PMessage(identity, 'cannot edit me');

    await expect(
      decryptP2PMessage(identity, {
        ...payload,
        aad: payload.aad.replace(identity.keyId.slice(0, 4), 'xxxx'),
      })
    ).rejects.toThrow(/metadata/i);
  });

  it('rejects unsupported payload formats and wrong key identifiers', async () => {
    const identity = await getOrCreateP2PIdentity();
    const payload = await encryptP2PMessage(identity, 'format guarded');

    await expect(
      decryptP2PMessage(identity, {
        ...payload,
        version: 2 as 1,
      })
    ).rejects.toThrow(/unsupported/i);

    await expect(
      decryptP2PMessage(identity, {
        ...payload,
        senderKeyId: 'wrong-sender',
        recipientKeyId: 'wrong-recipient',
        aad: payload.aad,
      })
    ).rejects.toThrow(/identifiers/i);
  });
});
