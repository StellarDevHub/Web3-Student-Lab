/**
 * VerifiableCredentialService — issue, sign, and verify W3C Verifiable
 * Credentials Data Model v2.0 course-completion credentials (issue #1107).
 *
 * Responsibilities:
 *   - Build a W3C VC v2.0 JSON-LD document for a course completion / diploma.
 *   - Sign it with the platform Ed25519 issuer key using the
 *     Ed25519Signature2020 Linked Data suite.
 *   - Verify submitted credentials: resolve the issuer DID document, fetch the
 *     issuer's Ed25519 public key, and cryptographically verify the proof.
 *     Tampered / forged credentials fail verification.
 *   - Produce downloadable VC JSON packages importable into wallets.
 */

import prisma from '../db/index.js';
import {
  COURSE_COMPLETION_VC_TYPE,
  ED25519_2020_SUITE_CONTEXT,
  ED25519_SIGNATURE_2020,
  ED25519_VERIFICATION_KEY_2020,
  VC_TYPE,
  W3C_VC_CONTEXT_V2,
  type CourseCompletionSubject,
  type VerifiableCredential,
  type VerifiableCredentialVerificationResult,
} from './verifiableCredential.types.js';
import {
  deriveIssuerKeyPair,
  signMessage,
  createSignedMessage,
  verifySignature,
  toMultibaseBase58,
} from './Ed25519Signature2020.js';
import { buildDidDocument } from '../services/didResolver.js';
import logger from '../utils/logger.js';

export class VerifiableCredentialService {
  /** Issuer DID and name from config, matching the certificate issuer. */
  private get issuerDid(): string {
    return (
      process.env.ISSUER_DID ||
      'did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT'
    );
  }

  private get issuerName(): string {
    return process.env.ISSUER_NAME || 'Web3 Student Lab';
  }

  private get apiBaseUrl(): string {
    return process.env.API_BASE_URL || 'http://localhost:8080';
  }

  /** The platform issuer Ed25519 key pair (shared with the PDF signer seed). */
  private get issuerKeyPair() {
    return deriveIssuerKeyPair(process.env.CERTIFICATE_SIGNING_SEED);
  }

  /**
   * Issue a signed W3C VC v2.0 course-completion credential for a certificate.
   * Returns the fully signed JSON-LD document, or null when the certificate
   * (or its course / student) cannot be resolved.
   */
  async issueCredential(certificateId: string): Promise<VerifiableCredential | null> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            walletAddress: true,
            did: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            instructor: true,
            credits: true,
          },
        },
      },
    });

    if (!certificate || !certificate.course) {
      return null;
    }

    const subject: CourseCompletionSubject = {
      id: certificate.did || this.walletToDid(certificate.student?.walletAddress),
      studentName:
        `${certificate.student?.firstName || ''} ${certificate.student?.lastName || ''}`.trim(),
      certificateId: certificate.id,
      courseId: certificate.course.id,
      courseTitle: certificate.course.title,
      instructor: certificate.course.instructor,
      credits: certificate.course.credits,
      completionDate: certificate.issuedAt.toISOString().split('T')[0] as string,
      tokenId: certificate.tokenId || undefined,
    };
    if (certificate.grade) {
      subject.grade = certificate.grade;
    }

    const issuerDid = this.issuerDid;
    const credentialId = `${this.apiBaseUrl}/api/v1/certificates/${certificateId}/vc`;
    const verificationMethod = `${issuerDid}#key-1`;
    const created = new Date().toISOString();

    const credential: VerifiableCredential = {
      '@context': [W3C_VC_CONTEXT_V2, ED25519_2020_SUITE_CONTEXT],
      id: credentialId,
      type: [VC_TYPE, COURSE_COMPLETION_VC_TYPE],
      issuer: { id: issuerDid, name: this.issuerName },
      validFrom: certificate.issuedAt.toISOString(),
      credentialSubject: subject,
    };

    const { privateKey } = this.issuerKeyPair;
    const proof = {
      type: ED25519_SIGNATURE_2020,
      created,
      verificationMethod,
      proofPurpose: 'assertionMethod',
      proofValue: '',
    };

    const message = createSignedMessage(credential as unknown as Record<string, unknown>, proof);
    const signatureBytes = signMessage(message, privateKey);
    proof.proofValue = toMultibaseBase58(signatureBytes);

    return { ...credential, proof: proof as VerifiableCredential['proof'] };
  }

  /**
   * Verify a submitted W3C VC: resolve the issuer DID document, extract the
   * issuer's Ed25519 public key, and cryptographically verify the
   * Ed25519Signature2020 proof. Also rejects revoked credentials.
   */
  async verifyCredential(
    credential: VerifiableCredential
  ): Promise<VerifiableCredentialVerificationResult> {
    if (!credential || typeof credential !== 'object') {
      return { valid: false, reason: 'Credential must be an object' };
    }

    const issuerId =
      typeof credential.issuer === 'string' ? credential.issuer : credential.issuer?.id;
    const proof = credential.proof;
    if (!issuerId) {
      return { valid: false, reason: 'Credential has no issuer' };
    }
    if (!proof || proof.type !== ED25519_SIGNATURE_2020) {
      return {
        valid: false,
        reason: `Missing or unsupported proof (expected ${ED25519_SIGNATURE_2020})`,
      };
    }

    // Resolve the issuer DID document to obtain the public key.
    const publicKeyRaw = this.resolveIssuerPublicKey(issuerId);
    if (!publicKeyRaw) {
      return {
        valid: false,
        reason: 'Could not resolve issuer DID verification key',
        issuerDid: issuerId,
      };
    }

    const verified = verifySignature(
      credential as unknown as Record<string, unknown>,
      proof as unknown as Record<string, unknown>,
      publicKeyRaw
    );

    if (!verified) {
      return {
        valid: false,
        reason: 'Signature verification failed (tampered or forged credential)',
        issuerDid: issuerId,
      };
    }

    // Reject revoked certificates so a revoked diploma cannot be replayed.
    const revoked = await this.isRevoked(credential.credentialSubject?.certificateId);
    if (revoked) {
      return {
        valid: false,
        revoked: true,
        reason: 'Credential has been revoked',
        issuerDid: issuerId,
      };
    }

    return {
      valid: true,
      credential,
      issuerDid: issuerId,
      proofType: ED25519_SIGNATURE_2020,
      verifiedProof: true,
    };
  }

  /** The issuer DID document (JSON-LD) exposing the Ed25519 verification key. */
  getIssuerDidDocument(): Record<string, unknown> {
    const { publicKey } = this.issuerKeyPair;
    return buildDidDocument({
      did: this.issuerDid,
      publicKeyBase64: publicKey.toString('base64'),
      githubHandle: process.env.ISSUER_GITHUB_HANDLE || null,
      services: [
        {
          id: `${this.issuerDid}#credential-issuer`,
          type: 'CredentialIssuer',
          serviceEndpoint: `${this.apiBaseUrl}/api/v1/certificates/vc/verify`,
        },
      ],
    });
  }

  /**
   * Resolve the issuer's Ed25519 public key from its DID document.
   * Prefers the platform issuer DID; falls back to the DID document
   * verification method when a different issuer DID is used.
   */
  private resolveIssuerPublicKey(issuerDid: string): Buffer | null {
    try {
      if (issuerDid === this.issuerDid) {
        return this.issuerKeyPair.publicKey;
      }
      // External issuer: reconstruct from DID document verification method.
      const doc = buildDidDocument({ did: issuerDid });
      const vm = doc.verificationMethod?.[0];
      if (vm?.publicKeyBase64) {
        return Buffer.from(vm.publicKeyBase64, 'base64');
      }
      return null;
    } catch (error) {
      logger.warn(`Failed to resolve issuer DID ${issuerDid}:`, error);
      return null;
    }
  }

  private async isRevoked(certificateId?: string): Promise<boolean> {
    if (!certificateId) return false;
    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      select: { status: true },
    });
    return cert?.status === 'REVOKED';
  }

  /** Normalize a Stellar wallet address into a did:stellar DID. */
  private walletToDid(walletAddress?: string | null): string {
    if (!walletAddress) return '';
    return `did:stellar:${walletAddress}`;
  }
}

export const verifiableCredentialService = new VerifiableCredentialService();
