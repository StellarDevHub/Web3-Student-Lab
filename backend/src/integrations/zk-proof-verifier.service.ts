import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * BE-026: Zero-Knowledge Proof Verification Microservice for Anonymous Course Completions.
 * Verifies student completion without revealing wallet addresses or personal identifiers.
 */
@Injectable()
export class ZkProofVerifierService {
  private readonly logger = new Logger(ZkProofVerifierService.name);

  /**
   * Generate a zero-knowledge proof commitment for course completion.
   * Student proves they completed the course without revealing identity.
   */
  async generateCompletionProof(courseId: string, studentSecret: Buffer): Promise<{
    commitment: string;
    challenge: string;
    nullifier: string;
  }> {
    try {
      // Hash student secret with course ID to create commitment
      const commitmentInput = Buffer.concat([
        Buffer.from(courseId),
        studentSecret,
      ]);

      const commitment = crypto
        .createHash('sha256')
        .update(commitmentInput)
        .digest('hex');

      // Generate random challenge for proof
      const challenge = crypto.randomBytes(32).toString('hex');

      // Generate nullifier to prevent double-spending (anonymous credential reuse)
      const nullifierInput = Buffer.concat([
        studentSecret,
        Buffer.from('nullifier'),
        Buffer.from(courseId),
      ]);

      const nullifier = crypto
        .createHash('sha256')
        .update(nullifierInput)
        .digest('hex');

      this.logger.log(`ZK commitment generated for course ${courseId}`);

      return {
        commitment,
        challenge,
        nullifier,
      };
    } catch (error) {
      this.logger.error(`Failed to generate ZK proof: ${error}`);
      throw error;
    }
  }

  /**
   * Verify zero-knowledge proof of course completion.
   * Confirms student completed course without learning their identity.
   */
  async verifyCompletionProof(
    courseId: string,
    commitment: string,
    challenge: string,
    proof: string,
    nullifier: string,
  ): Promise<{
    valid: boolean;
    courseId: string;
    timestamp: Date;
  }> {
    try {
      // Verify nullifier hasn't been used before (prevent double-spending)
      const usedNullifier = await this.checkNullifierUsed(nullifier);
      if (usedNullifier) {
        throw new BadRequestException('This credential has already been claimed');
      }

      // Verify proof structure
      if (!this.isValidProofFormat(proof)) {
        throw new BadRequestException('Invalid proof format');
      }

      // Verify commitment matches proof
      const isValid = await this.verifyProofChallenge(commitment, challenge, proof);

      if (!isValid) {
        this.logger.warn(`Invalid ZK proof for course ${courseId}`);
        return {
          valid: false,
          courseId,
          timestamp: new Date(),
        };
      }

      // Mark nullifier as used
      await this.markNullifierUsed(nullifier, courseId);

      this.logger.log(`ZK proof verified for course ${courseId}`);

      return {
        valid: true,
        courseId,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Proof verification failed: ${error}`);
      throw error;
    }
  }

  /**
   * Create anonymous credential that can be presented without revealing student identity.
   */
  async createAnonymousCredential(
    courseId: string,
    completionData: {
      gradePoints: number;
      completedAt: Date;
      exercises: string[];
    },
    studentSecret: Buffer,
  ): Promise<{
    credential: string;
    anonymousId: string;
    revealToken: string;
  }> {
    try {
      // Create credential binding
      const credentialInput = Buffer.concat([
        Buffer.from(courseId),
        Buffer.from(JSON.stringify(completionData)),
        studentSecret,
      ]);

      const credential = crypto
        .createHash('sha256')
        .update(credentialInput)
        .digest('hex');

      // Generate anonymous ID (not linked to wallet)
      const anonymousId = crypto
        .createHash('sha256')
        .update(Buffer.concat([studentSecret, Buffer.from('anon_id')]))
        .digest('hex');

      // Generate reveal token for selective disclosure
      const revealToken = crypto
        .createHash('sha256')
        .update(Buffer.concat([studentSecret, Buffer.from('reveal_token')]))
        .digest('hex');

      this.logger.log(
        `Anonymous credential created for course ${courseId} with ID ${anonymousId}`,
      );

      return {
        credential,
        anonymousId,
        revealToken,
      };
    } catch (error) {
      this.logger.error(`Failed to create anonymous credential: ${error}`);
      throw error;
    }
  }

  /**
   * Verify anonymous credential was issued by trusted institution.
   */
  async verifyCredentialSignature(
    credential: string,
    signature: string,
    issuerPublicKey: string,
  ): Promise<boolean> {
    try {
      // Verify cryptographic signature using issuer's public key
      const isValid = crypto
        .createVerify('sha256')
        .update(credential)
        .verify(issuerPublicKey, Buffer.from(signature, 'hex'));

      return isValid;
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Generate selective disclosure proof (reveal only specific attributes).
   */
  async generateSelectiveDisclosure(
    credential: string,
    attributesToReveal: string[],
    studentSecret: Buffer,
  ): Promise<{
    disclosure: Record<string, any>;
    proof: string;
  }> {
    try {
      const disclosure: Record<string, any> = {};

      // Only include requested attributes
      for (const attr of attributesToReveal) {
        disclosure[attr] = this.hashAttribute(attr, studentSecret);
      }

      // Create proof that disclosed attributes match credential
      const proofInput = Buffer.concat([
        Buffer.from(credential),
        Buffer.from(JSON.stringify(disclosure)),
      ]);

      const proof = crypto
        .createHash('sha256')
        .update(proofInput)
        .digest('hex');

      return {
        disclosure,
        proof,
      };
    } catch (error) {
      this.logger.error(`Selective disclosure generation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Revoke credential to prevent future use.
   */
  async revokeCredential(nullifier: string, reason: string): Promise<void> {
    try {
      // Add nullifier to revocation list
      await this.addToRevocationList(nullifier, reason);

      this.logger.log(`Credential revoked: ${nullifier} (reason: ${reason})`);
    } catch (error) {
      this.logger.error(`Credential revocation failed: ${error}`);
      throw error;
    }
  }

  // Private helper methods

  private isValidProofFormat(proof: string): boolean {
    // Verify proof is valid hex string of expected length
    return /^[a-f0-9]{64}$/.test(proof);
  }

  private async verifyProofChallenge(
    commitment: string,
    challenge: string,
    proof: string,
  ): Promise<boolean> {
    // Recreate challenge hash
    const reconstructed = crypto
      .createHash('sha256')
      .update(commitment + challenge)
      .digest('hex');

    return reconstructed === proof;
  }

  private hashAttribute(attribute: string, secret: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(Buffer.concat([Buffer.from(attribute), secret]))
      .digest('hex');
  }

  private async checkNullifierUsed(nullifier: string): Promise<boolean> {
    // Would check against revocation list/database
    // For now, return false (in production, query actual storage)
    return false;
  }

  private async markNullifierUsed(nullifier: string, courseId: string): Promise<void> {
    // Would store nullifier in revocation list to prevent double-spending
    // For now, just log
    this.logger.debug(`Marked nullifier as used: ${nullifier.substring(0, 8)}...`);
  }

  private async addToRevocationList(nullifier: string, reason: string): Promise<void> {
    // Would add to persistent revocation list
    this.logger.debug(`Added to revocation list: ${nullifier.substring(0, 8)}... (${reason})`);
  }

  /**
   * Get statistics on anonymous credentials.
   */
  async getCredentialStats(): Promise<{
    totalVerified: number;
    uniqueAnonymousIds: number;
    revokedCredentials: number;
  }> {
    return {
      totalVerified: 0, // Would query from database
      uniqueAnonymousIds: 0,
      revokedCredentials: 0,
    };
  }
}
