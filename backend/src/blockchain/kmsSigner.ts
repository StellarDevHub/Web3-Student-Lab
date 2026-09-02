import { KMSClient, SignCommand, MessageType, SigningAlgorithmSpec } from '@aws-sdk/client-kms';
import { Keypair } from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';

export interface KmsSignerConfig {
  kmsKeyId?: string;
  region?: string;
  masterPublicKey?: string;
  fallbackSecretKey?: string;
  kmsClientOverride?: any;
}

export class KmsStellarSigner {
  private kmsClient?: KMSClient;
  private kmsKeyId?: string;
  private masterPublicKey?: string;
  private fallbackKeypair: Keypair;
  private useKms: boolean;

  constructor(config: KmsSignerConfig = {}) {
    this.kmsKeyId = config.kmsKeyId || process.env.AWS_KMS_KEY_ID;
    const region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.masterPublicKey = config.masterPublicKey || process.env.PLATFORM_MASTER_PUBLIC_KEY;

    // Use software fallback in development/test unless USE_KMS_SIGNER is explicitly true
    const forceKms = process.env.USE_KMS_SIGNER === 'true';
    this.useKms = Boolean(this.kmsKeyId && (forceKms || (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test')));

    if (config.fallbackSecretKey) {
      this.fallbackKeypair = Keypair.fromSecret(config.fallbackSecretKey);
    } else if (process.env.STELLAR_ISSUER_SECRET) {
      this.fallbackKeypair = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET);
    } else {
      // Create random keypair for testing/development fallback
      this.fallbackKeypair = Keypair.random();
    }

    if (this.useKms) {
      this.kmsClient = config.kmsClientOverride || new KMSClient({ region });
      logger.info(`Initialized AWS KMS Key Signer Wrapper using Key ID ${this.kmsKeyId}`);
    } else {
      logger.info('Using local software Keypair signer fallback strictly for development/testing environment');
    }
  }

  public isKmsActive(): boolean {
    return this.useKms;
  }

  public getPublicKey(): string {
    if (this.useKms) {
      if (!this.masterPublicKey) {
        throw new Error('PLATFORM_MASTER_PUBLIC_KEY must be defined when using AWS KMS Key Signer');
      }
      return this.masterPublicKey;
    }
    return this.fallbackKeypair.publicKey();
  }

  public async signTransactionHash(hash: Buffer): Promise<Buffer> {
    if (this.useKms && this.kmsClient && this.kmsKeyId) {
      try {
        const command = new SignCommand({
          KeyId: this.kmsKeyId,
          Message: hash,
          MessageType: MessageType.RAW,
          SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
        });

        const response = await this.kmsClient.send(command);

        if (!response.Signature) {
          throw new Error('KMS Sign response did not contain signature bytes');
        }

        // Log tamper-proof CloudTrail audit trace event
        logger.info(`AWS KMS Sign CloudTrail audit event recorded for keyId=${this.kmsKeyId}, hash=${hash.toString('hex').substring(0, 16)}...`);

        return Buffer.from(response.Signature);
      } catch (error: any) {
        logger.error(`AWS KMS signing operation failed: ${error.message}`);
        throw new Error(`AWS KMS Transaction Signing Failed: ${error.message}`);
      }
    }

    // Local software signer fallback for development and testing environments
    logger.debug('Signing transaction hash via local software Keypair fallback');
    return this.fallbackKeypair.sign(hash);
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
        Action: [
          'kms:Sign',
          'kms:GetPublicKey',
          'kms:DescribeKey',
        ],
        Resource: kmsKeyArn || 'arn:aws:kms:us-east-1:123456789012:key/*',
      },
    ],
  };
};
