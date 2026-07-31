import { createHash } from 'crypto';

/**
 * The subset of certificate fields that make up the certificate's
 * immutable content hash. Only fields that describe *what was issued*
 * are included — mutable bookkeeping fields (status, revocation info,
 * timestamps that change after issuance, etc.) are intentionally
 * excluded so the hash only changes if the substance of the
 * certificate itself is altered.
 */
export interface HashableCertificateFields {
  id: string;
  studentId: string;
  courseId: string;
  tokenId: string | null;
  grade: string | null;
  did: string | null;
  issuedAt: Date | string;
}

/**
 * Builds a deterministic, canonical JSON representation of the
 * hashable certificate fields. Keys are emitted in a fixed, sorted
 * order and dates are normalized to ISO strings so the same logical
 * certificate always canonicalizes to the same string regardless of
 * property insertion order or Date vs. string representation.
 */
export function canonicalizeCertificateFields(cert: HashableCertificateFields): string {
  const issuedAtIso =
    typeof cert.issuedAt === 'string' ? cert.issuedAt : cert.issuedAt.toISOString();

  const canonical: Record<string, string> = {
    courseId: cert.courseId,
    did: cert.did ?? '',
    grade: cert.grade ?? '',
    id: cert.id,
    issuedAt: issuedAtIso,
    studentId: cert.studentId,
    tokenId: cert.tokenId ?? '',
  };

  // Object.keys order is insertion order for string keys, so we sort
  // explicitly to guarantee determinism independent of how the object
  // literal above is written.
  const sortedKeys = Object.keys(canonical).sort();
  const ordered: Record<string, string> = {};
  for (const key of sortedKeys) {
    ordered[key] = canonical[key] as string;
  }

  return JSON.stringify(ordered);
}

/**
 * Computes the SHA-256 content hash for a certificate's hashable
 * fields. This is the value persisted at mint time and recomputed at
 * verification time to detect tampering.
 */
export function computeCertificateContentHash(cert: HashableCertificateFields): string {
  const canonical = canonicalizeCertificateFields(cert);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Result of comparing a certificate's stored content hash against a
 * freshly recomputed one.
 */
export type ContentHashVerification =
  | { state: 'valid' }
  | { state: 'tampered'; expected: string; actual: string }
  | { state: 'unverified' }; // no stored hash to check against (legacy record)

/**
 * Verifies a certificate's integrity by recomputing its content hash
 * from the current stored fields and comparing it to the persisted
 * `contentHash`. Never silently serves mismatched data — callers must
 * branch on the returned state.
 */
export function verifyCertificateContentHash(
  cert: HashableCertificateFields,
  storedContentHash: string | null | undefined
): ContentHashVerification {
  if (!storedContentHash) {
    return { state: 'unverified' };
  }

  const recomputed = computeCertificateContentHash(cert);
  if (recomputed !== storedContentHash) {
    return { state: 'tampered', expected: storedContentHash, actual: recomputed };
  }

  return { state: 'valid' };
}
