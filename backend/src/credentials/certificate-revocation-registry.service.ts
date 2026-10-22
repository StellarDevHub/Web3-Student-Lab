import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * BE-032: Automated Certificate Revocation Registry with Merkle Tree Inclusion Proofs.
 * Maintains cryptographic proofs of certificate revocation status via Merkle accumulator.
 */
@Injectable()
export class CertificateRevocationRegistryService {
  private readonly logger = new Logger(CertificateRevocationRegistryService.name);
  private activeCertificates: Set<string> = new Set();
  private merkleRoot: string = '';

  /**
   * Revoke a certificate and update Merkle tree.
   */
  async revokeCertificate(certificateHash: string): Promise<{
    success: boolean;
    newMerkleRoot: string;
    revocationProof: string;
  }> {
    try {
      this.activeCertificates.delete(certificateHash);
      const newRoot = this.rebuildMerkleTree();
      this.merkleRoot = newRoot;

      const proof = this.generateRevocationProof(certificateHash);

      this.logger.log(
        `Certificate ${certificateHash.substring(0, 16)}... revoked. New root: ${newRoot.substring(0, 16)}...`,
      );

      return {
        success: true,
        newMerkleRoot: newRoot,
        revocationProof: proof,
      };
    } catch (error) {
      this.logger.error(`Failed to revoke certificate: ${error}`);
      throw error;
    }
  }

  /**
   * Register a new certificate.
   */
  registerCertificate(certificateHash: string): { merkleRoot: string; proof: string } {
    this.activeCertificates.add(certificateHash);
    const newRoot = this.rebuildMerkleTree();
    this.merkleRoot = newRoot;

    const proof = this.generateInclusionProof(certificateHash);

    return {
      merkleRoot: newRoot,
      proof,
    };
  }

  /**
   * Verify certificate is active (not revoked).
   */
  async verifyCertificateStatus(
    certificateHash: string,
    inclusionProof: string,
  ): Promise<{ isActive: boolean; verified: boolean }> {
    const isActive = this.activeCertificates.has(certificateHash);
    const proofValid = this.verifyInclusionProof(certificateHash, inclusionProof);

    return {
      isActive,
      verified: proofValid && isActive,
    };
  }

  /**
   * Generate inclusion proof for certificate in tree.
   */
  private generateInclusionProof(certificateHash: string): string {
    const sortedCerts = Array.from(this.activeCertificates).sort();
    const index = sortedCerts.indexOf(certificateHash);

    if (index === -1) {
      throw new Error('Certificate not found in active set');
    }

    const proof: string[] = [];
    let level = sortedCerts;

    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || level[i];
        const combined = this.hashPair(left, right);
        nextLevel.push(combined);

        if (i === Math.floor(index / 2) || (i + 1 === Math.floor(index / 2) && i + 1 < level.length)) {
          proof.push(i % 2 === 0 ? right : left);
        }
      }
      level = nextLevel;
      index = Math.floor(index / 2);
    }

    return proof.join(':');
  }

  /**
   * Generate revocation (non-membership) proof.
   */
  private generateRevocationProof(certificateHash: string): string {
    const sortedCerts = Array.from(this.activeCertificates).sort();
    const prevCert = sortedCerts.filter((h) => h < certificateHash).pop() || '';
    const nextCert = sortedCerts.find((h) => h > certificateHash) || '';

    return `${prevCert}|${nextCert}|${this.merkleRoot}`;
  }

  /**
   * Verify inclusion proof.
   */
  private verifyInclusionProof(certificateHash: string, proof: string): boolean {
    if (!proof) return false;
    const proofHashes = proof.split(':');
    let computed = certificateHash;

    for (const hash of proofHashes) {
      computed = this.hashPair(computed, hash);
    }

    return computed === this.merkleRoot;
  }

  /**
   * Hash a pair of values.
   */
  private hashPair(left: string, right: string): string {
    return crypto.createHash('sha256').update(left + right).digest('hex');
  }

  /**
   * Rebuild Merkle tree from active certificates.
   */
  private rebuildMerkleTree(): string {
    if (this.activeCertificates.size === 0) {
      return this.hashPair('', '');
    }

    let level = Array.from(this.activeCertificates).sort();

    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || level[i];
        nextLevel.push(this.hashPair(left, right));
      }
      level = nextLevel;
    }

    return level[0];
  }

  /**
   * Get current Merkle root.
   */
  getMerkleRoot(): string {
    return this.merkleRoot;
  }

  /**
   * Get active certificate count.
   */
  getActiveCertificateCount(): number {
    return this.activeCertificates.size;
  }
}
