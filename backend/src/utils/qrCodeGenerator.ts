import QRCode from 'qrcode';
import { QRCodeOptions } from '../types/certificate.types.js';
import logger from './logger.js';
import { VERIFICATION_URL } from '../config/rpcConfig.js';

/**
 * QR Code Generator
 * Creates QR codes for certificate verification links
 */
export class QRCodeGenerator {
  private readonly defaultSize: number;
  private readonly baseVerificationUrl: string;

  constructor() {
    this.defaultSize = 200;
    this.baseVerificationUrl = VERIFICATION_URL;
  }

  /**
   * Generates a QR code as a data URL (PNG)
   * @param options - QR code options
   * @returns Promise<string> - Data URL containing QR code image
   */
  async generateQRCode(options: QRCodeOptions): Promise<string> {
    const { data, size = this.defaultSize } = options;

    try {
      const qrDataUrl = await QRCode.toDataURL(data, {
        width: size,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });

      logger.debug(`QR code generated for ${data.substring(0, 30)}...`, { size });
      return qrDataUrl;
    } catch (error) {
      logger.error('Failed to generate QR code:', error);
      throw new Error(
        `QR generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generates a QR code as a Buffer (PNG)
   * @param options - QR code options
   * @returns Promise<Buffer> - PNG buffer
   */
  async generateQRCodeBuffer(options: QRCodeOptions): Promise<Buffer> {
    const { data, size = this.defaultSize } = options;

    try {
      const qrBuffer = await QRCode.toBuffer(data, {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'H',
      });

      logger.debug(`QR buffer generated: ${qrBuffer.length} bytes`);
      return qrBuffer;
    } catch (error) {
      logger.error('Failed to generate QR buffer:', error);
      throw new Error(
        `QR generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generates a verification QR code for a specific certificate
   * @param tokenId - Certificate token ID
   * @returns QR code data URL pointing to verification URL
   */
  async generateCertificateVerificationQR(tokenId: string): Promise<string> {
    const verificationUrl = `${this.baseVerificationUrl}/${tokenId}`;
    return this.generateQRCode({ data: verificationUrl, size: 200 });
  }

  /**
   * Generates a QR code pointing directly to metadata endpoint
   */
  async generateMetadataQR(tokenId: string): Promise<string> {
    const metadataUrl = `${this.baseVerificationUrl}/${tokenId}/metadata`;
    return this.generateQRCode({ data: metadataUrl, size: 200 });
  }

  /**
   * Generates QR code for a direct on-chain verification link
   */
  async generateOnChainVerificationQR(
    tokenId: string,
    contractAddress: string,
    network: string = 'stellar-testnet'
  ): Promise<string> {
    const explorerUrl =
      network === 'stellar-testnet'
        ? `https://testnet.steexp.com/contract/${contractAddress}`
        : `https://steexp.com/contract/${contractAddress}`;

    const verificationData = JSON.stringify({
      tokenId,
      contractAddress,
      network,
      verifyAt: explorerUrl,
    });

    return this.generateQRCode({ data: verificationData, size: 200 });
  }

  /**
   * Generates a vCard-style credential card with QR
   */
  async generateCredentialCardQR(
    certificateId: string,
    studentName: string,
    courseTitle: string
  ): Promise<string> {
    const credentialData = JSON.stringify({
      type: 'Web3-Student-Lab-Certificate',
      version: '1.0',
      certificateId,
      student: studentName,
      course: courseTitle,
      verifiedAt: new Date().toISOString(),
      issuer: 'Web3 Student Lab',
    });

    return this.generateQRCode({ data: credentialData, size: 200 });
  }

  /**
   * Generates multiple QR codes in batch
   */
  async generateBatchQR(tokenIds: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    const batchSize = 10;
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((tokenId) => this.generateCertificateVerificationQR(tokenId))
      );

      batch.forEach((tokenId, idx) => {
        const result = batchResults[idx];
        if (result) {
          results.set(tokenId, result);
        }
      });

      if (i + batchSize < tokenIds.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Validates QR code data format
   */
  validateQRData(data: string): { valid: boolean; type?: string; tokenId?: string } {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'Web3-Student-Lab-Certificate') {
        return {
          valid: true,
          type: 'credential',
          tokenId: parsed.certificateId as string,
        };
      }

      if (data.startsWith(this.baseVerificationUrl)) {
        const parts = data.split('/');
        const tokenId = parts[parts.length - 1] as string;
        return {
          valid: true,
          type: 'verification-url',
          tokenId,
        };
      }

      return { valid: false };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Small delay helper for batch operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const qrCodeGenerator = new QRCodeGenerator();
