/**
 * W3C Verifiable Credentials Data Model v2.0 types (issue #1107).
 *
 * Course completion attestations are issued as cryptographically signed
 * JSON-LD credentials conforming to the W3C Verifiable Credentials Data
 * Model v2.0, linked to student DIDs and signed with the platform
 * Ed25519 issuer key using the Ed25519Signature2020 Linked Data suite.
 */

export const W3C_VC_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2';
export const ED25519_2020_SUITE_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1';

export const VC_TYPE = 'VerifiableCredential';
export const COURSE_COMPLETION_VC_TYPE = 'CourseCompletionCredential';

export const ED25519_SIGNATURE_2020 = 'Ed25519Signature2020';
export const ED25519_VERIFICATION_KEY_2020 = 'Ed25519VerificationKey2020';
export const ASSERTION_METHOD = 'assertionMethod';

/** A W3C Verifiable Credential v2.0 proof object. */
export interface LinkedDataProof {
  type: typeof ED25519_SIGNATURE_2020;
  created: string;
  verificationMethod: string;
  proofPurpose: typeof ASSERTION_METHOD;
  proofValue: string;
}

/** Credential subject: the graduate and the course completion evidence. */
export interface CourseCompletionSubject {
  id: string;
  type?: 'Student';
  studentName?: string;
  certificateId: string;
  courseId: string;
  courseTitle: string;
  instructor?: string;
  credits?: number;
  grade?: string;
  completionDate: string;
  tokenId?: string;
}

/** A W3C Verifiable Credential v2.0 document (unsigned or signed). */
export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string | { id: string; name?: string };
  validFrom: string;
  credentialSubject: CourseCompletionSubject;
  proof?: LinkedDataProof;
}

/** Result of verifying a Verifiable Credential. */
export interface VerifiableCredentialVerificationResult {
  valid: boolean;
  credential?: VerifiableCredential;
  issuerDid?: string;
  proofType?: string;
  verifiedProof?: boolean;
  revoked?: boolean;
  reason?: string;
}

/** Request body for verifying a submitted Verifiable Credential. */
export interface VerifyCredentialRequest {
  credential: VerifiableCredential;
}
