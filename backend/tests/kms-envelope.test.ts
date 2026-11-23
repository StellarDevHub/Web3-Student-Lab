import { describe, expect, it, jest } from '@jest/globals';
import { KmsEnvelopeEncryption } from '../src/services/encryptionKeyManager.js';

/**
 * Tests for KMS envelope encryption (#1423 / BE-HARD-32): a fresh data key is
 * wrapped by KMS and used to AES-256-GCM encrypt the payload.
 */

const DATA_KEY = Buffer.alloc(32, 7);

const buildEnvelope = () => {
  const mockClient = {
    send: jest.fn<any>().mockImplementation(async (command: any) => {
      // GenerateDataKeyCommand carries KeySpec; DecryptCommand carries CiphertextBlob.
      if (command?.input && 'KeySpec' in command.input) {
        return { Plaintext: DATA_KEY, CiphertextBlob: Buffer.from('wrapped-data-key') };
      }
      return { Plaintext: DATA_KEY };
    }),
  };

  const envelope = new KmsEnvelopeEncryption({
    kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/test-cmk',
    kmsClientOverride: mockClient,
  });

  return { envelope, mockClient };
};

describe('KmsEnvelopeEncryption (#1423)', () => {
  it('round-trips a payload through a KMS-wrapped data key', async () => {
    const { envelope, mockClient } = buildEnvelope();
    expect(envelope.isKmsActive()).toBe(true);

    const secret = 'student-github-access-token';
    const encrypted = await envelope.encrypt(secret);

    expect(encrypted.startsWith('kms:v1:')).toBe(true);
    expect(encrypted).not.toContain(secret);

    const decrypted = await envelope.decrypt(encrypted);
    expect(decrypted).toBe(secret);

    // One GenerateDataKey (wrap) + one Decrypt (unwrap).
    expect(mockClient.send).toHaveBeenCalledTimes(2);
  });

  it('fails closed when no KMS key is configured', async () => {
    const previous = process.env.AWS_KMS_KEY_ID;
    delete process.env.AWS_KMS_KEY_ID;
    try {
      const envelope = new KmsEnvelopeEncryption({});
      expect(envelope.isKmsActive()).toBe(false);
      await expect(envelope.encrypt('x')).rejects.toThrow(/AWS_KMS_KEY_ID/);
    } finally {
      if (previous !== undefined) {
        process.env.AWS_KMS_KEY_ID = previous;
      }
    }
  });

  it('rejects malformed envelopes', async () => {
    const { envelope } = buildEnvelope();
    await expect(envelope.decrypt('not-a-kms-envelope')).rejects.toThrow(/Invalid KMS envelope/);
  });
});
