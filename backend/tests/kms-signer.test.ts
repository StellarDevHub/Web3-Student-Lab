import { describe, expect, it, jest } from '@jest/globals';
import { getKmsIamPolicy, KmsStellarSigner } from '../src/blockchain/kmsSigner.js';

describe('AWS KMS Key Signer Wrapper Suite', () => {
  const dummyHash = Buffer.from('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'hex');

  it('uses local software Keypair fallback in development/test environment', async () => {
    const signer = new KmsStellarSigner({
      kmsKeyId: undefined,
    });

    expect(signer.isKmsActive()).toBe(false);
    expect(signer.getPublicKey()).toMatch(/^G[A-Z0-9]{55}$/);

    const signature = await signer.signTransactionHash(dummyHash);
    expect(signature).toBeInstanceOf(Buffer);
    expect(signature.length).toBeGreaterThan(0);
  });

  it('routes transaction signing through AWS KMS when KMS mode is enabled', async () => {
    const mockKmsClient = {
      send: jest.fn<any>().mockResolvedValue({
        Signature: Buffer.from('mock-kms-signature-bytes'),
      }),
    };

    const signer = new KmsStellarSigner({
      kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/test-kms-key-id',
      masterPublicKey: 'GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT',
      kmsClientOverride: mockKmsClient,
    });

    // Explicitly set useKms flag for testing
    (signer as any).useKms = true;
    (signer as any).kmsClient = mockKmsClient;

    expect(signer.isKmsActive()).toBe(true);
    expect(signer.getPublicKey()).toBe('GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT');

    const signature = await signer.signTransactionHash(dummyHash);
    expect(signature.toString()).toBe('mock-kms-signature-bytes');
    expect(mockKmsClient.send).toHaveBeenCalledTimes(1);
  });

  it('generates IAM role policy restricting signing permissions', () => {
    const keyArn = 'arn:aws:kms:us-east-1:123456789012:key/abc-123';
    const policy = getKmsIamPolicy(keyArn) as any;

    expect(policy.Version).toBe('2012-10-17');
    expect(policy.Statement[0].Action).toContain('kms:Sign');
    expect(policy.Statement[0].Resource).toBe(keyArn);
  });
});
