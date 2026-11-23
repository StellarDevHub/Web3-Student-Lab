import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  auditLogger: {
    info: jest.fn(),
  },
  getTraceId: () => 'trace-test',
}));

import { GetPublicKeyCommand, SignCommand } from '@aws-sdk/client-kms';
import { Account, Keypair, Networks, Operation, Asset, TransactionBuilder } from '@stellar/stellar-sdk';
import { VaultClient, loadVaultConfig } from '../src/config/vault.js';
import {
  AwsKmsHsmSigner,
  KmsSignerService,
  SoftwareDevSigner,
  VaultTransitHsmSigner,
  createHsmSignerFromEnv,
  extractEd25519FromSpki,
  isSoftwareSignerPermitted,
  type HsmSigner,
  type SignatureAuditRecord,
} from '../src/services/kmsSignerService.js';
import { RelayerStellarService } from '../src/services/stellarService.js';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

/** Stand-in for the KMS HSM: holds the key "inside" the fake and returns only signatures. */
function createFakeKmsClient(keypair: Keypair, requestId = 'iam-req-123') {
  const send = jest.fn(async (command: unknown) => {
    if (command instanceof GetPublicKeyCommand) {
      return { PublicKey: new Uint8Array(Buffer.concat([ED25519_SPKI_PREFIX, keypair.rawPublicKey()])) };
    }
    if (command instanceof SignCommand) {
      const message = Buffer.from(command.input.Message as Uint8Array);
      return {
        Signature: new Uint8Array(keypair.sign(message)),
        KeyId: 'arn:aws:kms:us-east-1:111122223333:key/relayer',
        $metadata: { requestId },
      };
    }
    throw new Error('unexpected command');
  });
  return { send } as unknown as { send: jest.Mock };
}

function createVaultFetch(keypair: Keypair) {
  return jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    let payload: unknown;
    if (url.endsWith('/v1/transit/keys/stellar-relayer')) {
      payload = {
        request_id: 'vault-read-1',
        data: {
          type: 'ed25519',
          latest_version: 2,
          keys: { '2': { public_key: keypair.rawPublicKey().toString('base64') } },
        },
      };
    } else if (url.endsWith('/v1/transit/sign/stellar-relayer') && init?.method === 'POST') {
      const { input } = JSON.parse(init.body as string) as { input: string };
      const signature = keypair.sign(Buffer.from(input, 'base64')).toString('base64');
      payload = { request_id: 'vault-sign-42', data: { signature: `vault:v2:${signature}` } };
    } else {
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => '{"errors":["not found"]}' };
    }
    return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(payload) };
  });
}

describe('extractEd25519FromSpki', () => {
  it('strips the RFC 8410 prefix', () => {
    const raw = Keypair.random().rawPublicKey();
    expect(extractEd25519FromSpki(Buffer.concat([ED25519_SPKI_PREFIX, raw])).equals(raw)).toBe(true);
  });

  it('rejects non-Ed25519 keys', () => {
    expect(() => extractEd25519FromSpki(Buffer.alloc(91))).toThrow(/ECC_NIST_EDWARDS25519/);
  });
});

describe('AwsKmsHsmSigner', () => {
  it('signs via KMS with pure Ed25519 and returns the IAM request id', async () => {
    const keypair = Keypair.random();
    const client = createFakeKmsClient(keypair);
    const signer = new AwsKmsHsmSigner({ keyId: 'alias/relayer', client: client as never });
    const payload = Buffer.alloc(32, 7);

    await expect(signer.getPublicKey()).resolves.toBe(keypair.publicKey());
    const result = await signer.sign(payload);

    expect(result.requestId).toBe('iam-req-123');
    expect(keypair.verify(payload, result.signature)).toBe(true);
    const signCommand = client.send.mock.calls[1]?.[0] as SignCommand;
    expect(signCommand.input).toMatchObject({
      KeyId: 'alias/relayer',
      MessageType: 'RAW',
      SigningAlgorithm: 'ED25519_SHA_512',
    });
  });
});

describe('VaultTransitHsmSigner', () => {
  it('signs through the transit engine and strips the vault:vN: prefix', async () => {
    const keypair = Keypair.random();
    const config = loadVaultConfig({ VAULT_ADDR: 'http://vault.local:8200', VAULT_TOKEN: 'root' } as NodeJS.ProcessEnv);
    const signer = new VaultTransitHsmSigner(config, new VaultClient(config, createVaultFetch(keypair) as never));
    const payload = Buffer.alloc(32, 9);

    const result = await signer.sign(payload);

    expect(result.requestId).toBe('vault-sign-42');
    expect(result.keyRef).toBe('vault:transit/stellar-relayer@v2');
    expect(keypair.verify(payload, result.signature)).toBe(true);
  });

  it('refuses to start without credentials', () => {
    const config = loadVaultConfig({ VAULT_ADDR: 'http://vault.local:8200' } as NodeJS.ProcessEnv);
    expect(() => new VaultTransitHsmSigner(config)).toThrow(/VAULT_TOKEN/);
  });
});

describe('software signer gating', () => {
  it('is only permitted in development and test', () => {
    expect(isSoftwareSignerPermitted({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSoftwareSignerPermitted({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSoftwareSignerPermitted({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isSoftwareSignerPermitted({ NODE_ENV: 'staging' } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isSoftwareSignerPermitted({ NODE_ENV: 'test', HSM_ALLOW_SOFTWARE_SIGNER: 'false' } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('fails closed in production when no HSM is configured', () => {
    expect(() => createHsmSignerFromEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /No HSM signer configured/,
    );
    process.env.NODE_ENV = 'production';
    expect(() => new SoftwareDevSigner()).toThrow(/restricted/);
  });

  it('selects the provider from the environment', () => {
    expect(
      createHsmSignerFromEnv({ NODE_ENV: 'production', AWS_KMS_KEY_ID: 'alias/x' } as NodeJS.ProcessEnv).provider,
    ).toBe('aws-kms');
    expect(
      createHsmSignerFromEnv({
        NODE_ENV: 'production',
        VAULT_ADDR: 'https://vault.internal',
        VAULT_TOKEN: 't',
      } as NodeJS.ProcessEnv).provider,
    ).toBe('vault-transit');
    expect(createHsmSignerFromEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).provider).toBe('software-dev');
  });
});

describe('KmsSignerService', () => {
  let records: SignatureAuditRecord[];

  beforeEach(() => {
    records = [];
  });

  it('emits a hash-chained audit record with the IAM request id for every signature', async () => {
    const keypair = Keypair.random();
    const service = new KmsSignerService({
      signer: new AwsKmsHsmSigner({ keyId: 'alias/relayer', client: createFakeKmsClient(keypair) as never }),
      auditSinks: [(record) => void records.push(record)],
    });

    await service.signHash(Buffer.alloc(32, 1), { purpose: 'faucet' });
    await service.signHash(Buffer.alloc(32, 2));

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      event: 'hsm.sign',
      outcome: 'success',
      provider: 'aws-kms',
      iamRequestId: 'iam-req-123',
      purpose: 'faucet',
      publicKey: keypair.publicKey(),
      traceId: 'trace-test',
    });
    expect(records[0]?.prevHash).toBe('0'.repeat(64));
    expect(records[1]?.prevHash).toBe(records[0]?.hash);
    // Only digests are logged, never payload or signature bytes.
    expect(JSON.stringify(records)).not.toContain(Buffer.alloc(32, 1).toString('hex'));
  });

  it('rejects a signature that does not verify against the custodial key, and audits the failure', async () => {
    const custodial = Keypair.random();
    const rogue = Keypair.random();
    const signer: HsmSigner = {
      provider: 'aws-kms',
      getPublicKey: async () => custodial.publicKey(),
      sign: async (payload) => ({ signature: rogue.sign(payload), requestId: 'iam-req-bad', keyRef: 'k' }),
    };
    const service = new KmsSignerService({ signer, auditSinks: [(record) => void records.push(record)] });

    await expect(service.signHash(Buffer.alloc(32, 3))).rejects.toThrow(/failed verification/);
    expect(records[0]).toMatchObject({ outcome: 'failure', iamRequestId: 'iam-req-bad' });
  });

  it('records the AWS request id from SDK errors', async () => {
    const signer: HsmSigner = {
      provider: 'aws-kms',
      getPublicKey: async () => Keypair.random().publicKey(),
      sign: async () => {
        throw Object.assign(new Error('AccessDeniedException'), { $metadata: { requestId: 'iam-req-denied' } });
      },
    };
    const service = new KmsSignerService({ signer, auditSinks: [(record) => void records.push(record)] });

    await expect(service.signHash(Buffer.alloc(32))).rejects.toThrow(/AccessDeniedException/);
    expect(records[0]).toMatchObject({ outcome: 'failure', iamRequestId: 'iam-req-denied' });
  });
});

describe('RelayerStellarService', () => {
  it('wraps a user transaction in a fee-bump signed by the HSM relayer key', async () => {
    const relayer = Keypair.random();
    const user = Keypair.random();
    const service = new RelayerStellarService({
      signer: new KmsSignerService({
        signer: new AwsKmsHsmSigner({ keyId: 'alias/relayer', client: createFakeKmsClient(relayer) as never }),
      }),
      networkPassphrase: Networks.TESTNET,
      maxFeeStroops: 1000,
    });

    const inner = new TransactionBuilder(new Account(user.publicKey(), '1'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({ destination: relayer.publicKey(), asset: Asset.native(), amount: '1' }))
      .setTimeout(30)
      .build();
    inner.sign(user);

    const signed = await service.sponsorWithFeeBump(inner.toXDR(), 500);
    const feeBump = TransactionBuilder.fromXDR(signed.xdr, Networks.TESTNET);

    expect(signed.provider).toBe('aws-kms');
    expect(signed.requestId).toBe('iam-req-123');
    expect(signed.signerPublicKey).toBe(relayer.publicKey());
    expect(relayer.verify(feeBump.hash(), feeBump.signatures[0]!.signature())).toBe(true);
  });

  it('refuses unsigned inner transactions and fees above the cap', async () => {
    const service = new RelayerStellarService({
      signer: new KmsSignerService({ signer: new SoftwareDevSigner() }),
      networkPassphrase: Networks.TESTNET,
      maxFeeStroops: 1000,
    });
    const user = Keypair.random();
    const inner = new TransactionBuilder(new Account(user.publicKey(), '1'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.bumpSequence({ bumpTo: '10' }))
      .setTimeout(30)
      .build();

    await expect(service.sponsorWithFeeBump(inner.toXDR(), 500)).rejects.toThrow(/must be signed/);
    inner.sign(user);
    await expect(service.sponsorWithFeeBump(inner.toXDR(), 5000)).rejects.toThrow(/between 1 and 1000/);
  });
});
