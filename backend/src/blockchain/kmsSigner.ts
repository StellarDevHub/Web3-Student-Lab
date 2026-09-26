import { KMSClient, SignCommand, MessageType, SigningAlgorithmSpec } from '@aws-sdk/client-kms';
import { Keypair } from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';

/** Stellar signatures are Ed25519: exactly 64 bytes. */
export const STELLAR_ED25519_SIGNATURE_BYTES = 64;

export interface KmsSignerConfig {
  kmsKeyId?: string;
  region?: string;
  masterPublicKey?: string;
  fallbackSecretKey?: string;
  kmsClientOverride?: any;
  /**
   * KMS signing algorithm. Stellar requires an Ed25519 key
   * (`ECC_NIST_EDWARDS25519`) signed with `ED25519_SHA_512` / `RAW`.
   */
  signingAlgorithm?: SigningAlgorithmSpec;
  /** Fail closed when KMS is not usable (default: true in production). */
  requireKms?: boolean;
  /** Allow the local software keypair fallback (default: `!requireKms`). */
  allowSoftwareFallback?: boolean;
}

/**
 * Minimal shape of a signed payload. A Stellar `Transaction` satisfies this
 * structurally (`hash()` returns the signature hash, `addSignature()` attaches
 * a decorated signature).
 */
export interface KmsSignableTransaction {
  hash(): Buffer;
  addSignature(publicKey: string, signature: Buffer): void;
}

/**
 * Signs Stellar payloads with an AWS KMS asymmetric (Ed25519) key so the raw
 * private key never exists on disk or in application memory. A local software
 * keypair is only used as a development/test fallback.
 */
export class KmsStellarSigner {
  private kmsClient?: KMSClient;
  private kmsKeyId?: string;
  private masterPublicKey?: string;
  private fallbackKeypair?: Keypair;
  private useKms: boolean;
  private readonly signingAlgorithm: SigningAlgorithmSpec;
  private readonly requireKms: boolean;

  constructor(config: KmsSignerConfig = {}) {
    this.kmsKeyId = config.kmsKeyId || process.env.AWS_KMS_KEY_ID;
    const region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.masterPublicKey = config.masterPublicKey || process.env.PLATFORM_MASTER_PUBLIC_KEY;
    this.signingAlgorithm = config.signingAlgorithm ?? SigningAlgorithmSpec.ED25519_SHA_512;

    const isProduction = process.env.NODE_ENV === 'production';
    const requiredFlag = process.env.KMS_REQUIRED;
    // KMS is required by default in production, but can be explicitly disabled
    // with KMS_REQUIRED=false for environments that still use a software key.
    this.requireKms = config.requireKms ?? (requiredFlag ? requiredFlag === 'true' : isProduction);

    // Use software fallback in development/test unless USE_KMS_SIGNER is explicitly true.
    const forceKms = process.env.USE_KMS_SIGNER === 'true';
    this.useKms = Boolean(
      this.kmsKeyId && (forceKms || (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test')),
    );

    if (!this.useKms && this.requireKms) {
      throw new Error(
        'AWS KMS signing is required but no usable AWS_KMS_KEY_ID was configured. ' +
          'Set AWS_KMS_KEY_ID (and PLATFORM_MASTER_PUBLIC_KEY) or disable KMS_REQUIRED.',
      );
    }

    if (this.useKms) {
      this.kmsClient = config.kmsClientOverride || new KMSClient({ region });
      logger.info(`Initialized AWS KMS Key Signer Wrapper using Key ID ${this.kmsKeyId}`);
    } else {
      const allowSoftwareFallback = config.allowSoftwareFallback ?? !this.requireKms;
      if (!allowSoftwareFallback) {
        throw new Error('AWS KMS signer is not active and the software fallback is disabled');
      }
      if (config.fallbackSecretKey) {
        this.fallbackKeypair = Keypair.fromSecret(config.fallbackSecretKey);
      } else if (process.env.STELLAR_ISSUER_SECRET) {
        this.fallbackKeypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET);
      } else {
        // Random keypair strictly for development/testing environments.
        this.fallbackKeypair = Keypair.random();
      }
      logger.info('Using local software Keypair signer fallback strictly for development/testing environment');
    }
  }

  public isKmsActive(): boolean {
    return this.useKms;
  }

  public getSigningAlgorithm(): SigningAlgorithmSpec {
    return this.signingAlgorithm;
  }

  public getPublicKey(): string {
    if (this.useKms) {
      if (!this.masterPublicKey) {
        throw new Error('PLATFORM_MASTER_PUBLIC_KEY must be defined when using AWS KMS Key Signer');
      }
      return this.masterPublicKey;
    }
    return this.fallbackKeypair!.publicKey();
  }

  public async signTransactionHash(hash: Buffer): Promise<Buffer> {
    if (this.useKms && this.kmsClient && this.kmsKeyId) {
      try {
        const command = new SignCommand({
          KeyId: this.kmsKeyId,
          Message: hash,
          MessageType: MessageType.RAW,
          SigningAlgorithm: this.signingAlgorithm,
        });

        const response = await this.kmsClient.send(command);

        if (!response.Signature) {
          throw new Error('KMS Sign response did not contain signature bytes');
        }

        // Log tamper-proof CloudTrail audit trace event
        logger.info(
          `AWS KMS Sign CloudTrail audit event recorded for keyId=${this.kmsKeyId}, hash=${hash
            .toString('hex')
            .substring(0, 16)}...`,
        );

        return Buffer.from(response.Signature);
      } catch (error: any) {
        logger.error(`AWS KMS signing operation failed: ${error.message}`);
        throw new Error(`AWS KMS Transaction Signing Failed: ${error.message}`);
      }
    }

    // Local software signer fallback for development and testing environments
    logger.debug('Signing transaction hash via local software Keypair fallback');
    return this.fallbackKeypair!.sign(hash);
  }

  /**
   * Sign a Stellar transaction (or any payload exposing `hash()` /
   * `addSignature()`) with KMS and attach the signature in place.
   *
   * `purpose` is included in the audit log so contract-administration and
   * faucet signings can be told apart in CloudTrail-derived logs.
   */
  public async signTransaction<T extends KmsSignableTransaction>(
    transaction: T,
    purpose = 'transaction',
  ): Promise<T> {
    const hash = transaction.hash();
    const signature = await this.signTransactionHash(hash);

    if (signature.length !== STELLAR_ED25519_SIGNATURE_BYTES) {
      throw new Error(
        `KMS returned a ${signature.length}-byte signature; Stellar requires ${STELLAR_ED25519_SIGNATURE_BYTES}-byte ` +
          'Ed25519 signatures. Ensure the KMS key spec is ECC_NIST_EDWARDS25519 and the algorithm is ED25519_SHA_512.',
      );
    }

    transaction.addSignature(this.getPublicKey(), signature);
    logger.info(`Attached KMS ${purpose} signature for public key ${this.getPublicKey().substring(0, 8)}...`);
    return transaction;
  }
}

/**
 * Returns strict IAM Role Policy JSON restricting kms:Sign and kms:GetPublicKey permissions to backend pods
 */
export const getKmsIamPolicy = (kmsKeyArn: string): object => {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowStellarTransactionSigning',
        Effect: 'Allow',
        Action: ['kms:Sign', 'kms:GetPublicKey', 'kms:DescribeKey'],
        Resource: kmsKeyArn || 'arn:aws:kms:us-east-1:123456789012:key/*',
      },
    ],
  };
};
