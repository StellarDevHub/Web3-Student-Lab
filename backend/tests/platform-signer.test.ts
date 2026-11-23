import { describe, expect, it, jest } from '@jest/globals';
import { PlatformSigningService } from '../src/blockchain/platformSigner.js';
import { KmsStellarSigner } from '../src/blockchain/kmsSigner.js';

/**
 * Tests for the AWS KMS-backed platform signer (#1423 / BE-HARD-32):
 * contract-administration and faucet transactions must be signed via KMS
 * without any plaintext secret being loaded.
 */

const MASTER_PUBLIC_KEY = 'GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT';

const buildKmsSigner = (signature: Buffer) => {
  const mockClient = {
    send: jest.fn<any>().mockResolvedValue({ Signature: signature }),
  };

  const signer = new KmsStellarSigner({
    kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/test-kms-key-id',
    masterPublicKey: MASTER_PUBLIC_KEY,
    kmsClientOverride: mockClient,
  });

  // Force KMS mode for the test (same pattern as kms-signer.test.ts).
  (signer as any).useKms = true;
  (signer as any).kmsClient = mockClient;

  return { signer, mockClient };
};

const buildTransaction = () => {
  const addSignature = jest.fn();
  const tx = {
    hash: () => Buffer.alloc(32, 9),
    addSignature,
  };
  return { tx, addSignature };
};

describe('PlatformSigningService (#1423)', () => {
  it('signs contract-administration transactions through AWS KMS', async () => {
    const signature = Buffer.alloc(64, 1);
    const { signer, mockClient } = buildKmsSigner(signature);
    const service = new PlatformSigningService({}, signer);
    const { tx, addSignature } = buildTransaction();

    await service.signAdminTransaction(tx);

    expect(service.isKmsActive()).toBe(true);
    expect(mockClient.send).toHaveBeenCalledTimes(1);
    expect(addSignature).toHaveBeenCalledWith(MASTER_PUBLIC_KEY, signature);
  });

  it('signs faucet transactions through AWS KMS', async () => {
    const signature = Buffer.alloc(64, 2);
    const { signer, mockClient } = buildKmsSigner(signature);
    const service = new PlatformSigningService({}, signer);
    const { tx, addSignature } = buildTransaction();

    await service.signFaucetTransaction(tx);

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    expect(addSignature).toHaveBeenCalledWith(MASTER_PUBLIC_KEY, signature);
  });

  it('rejects a KMS signature that is not Ed25519-sized', async () => {
    const { signer } = buildKmsSigner(Buffer.alloc(32, 3));
    const service = new PlatformSigningService({}, signer);
    const { tx } = buildTransaction();

    await expect(service.signAdminTransaction(tx)).rejects.toThrow(/Ed25519/);
  });

  it('falls back to a software keypair in test when KMS is not configured', async () => {
    const service = new PlatformSigningService({ kmsKeyId: undefined });

    expect(service.isKmsActive()).toBe(false);
    expect(service.getPublicKey()).toMatch(/^G[A-Z0-9]{55}$/);

    const { tx, addSignature } = buildTransaction();
    await service.signFaucetTransaction(tx);
    expect(addSignature).toHaveBeenCalledTimes(1);
  });
});
