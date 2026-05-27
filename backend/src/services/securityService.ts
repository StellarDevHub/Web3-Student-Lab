import crypto from 'crypto';
import logger from '../utils/logger.js';

interface KeyPair {
  publicKey: string;
  privateKey: string;
  createdAt: number;
  expiresAt: number;
}

class SecurityService {
  private keyMap: Map<string, KeyPair> = new Map();
  private currentKeyId: string | null = null;
  private ROTATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private KEY_EXPIRY = 48 * 60 * 60 * 1000; // 48 hours (to allow some overlap)

  constructor() {
    this.rotateKeys();
    // Schedule rotation
    setInterval(() => this.rotateKeys(), this.ROTATION_INTERVAL);
  }

  public async rotateKeys(): Promise<void> {
    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      const keyId = crypto.randomUUID();
      const now = Date.now();

      this.keyMap.set(keyId, {
        publicKey,
        privateKey,
        createdAt: now,
        expiresAt: now + this.KEY_EXPIRY,
      });

      this.currentKeyId = keyId;
      logger.info(`RSA Key rotated. New Key ID: ${keyId}`);

      // Cleanup expired keys
      this.cleanupKeys();
    } catch (error) {
      logger.error('Failed to rotate RSA keys:', error);
    }
  }

  private cleanupKeys(): void {
    const now = Date.now();
    for (const [keyId, keyPair] of this.keyMap.entries()) {
      if (keyPair.expiresAt < now) {
        this.keyMap.delete(keyId);
        logger.info(`Expired RSA Key removed: ${keyId}`);
      }
    }
  }

  public getPublicKey(): { keyId: string; publicKey: string } | null {
    if (!this.currentKeyId) return null;
    const keyPair = this.keyMap.get(this.currentKeyId);
    if (!keyPair) return null;

    return {
      keyId: this.currentKeyId,
      publicKey: keyPair.publicKey,
    };
  }

  public decrypt(keyId: string, encryptedData: string): any {
    const keyPair = this.keyMap.get(keyId);
    if (!keyPair) {
      throw new Error('Invalid or expired key ID');
    }

    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt(
        {
          key: keyPair.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer
      );

      const result = JSON.parse(decrypted.toString());

      // Wipe decrypted buffer from memory as much as possible
      decrypted.fill(0);

      return result;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }
}

export const securityService = new SecurityService();
