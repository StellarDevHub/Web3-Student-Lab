import {
  computeCertificateContentHash,
  verifyCertificateContentHash,
  canonicalizeCertificateFields,
} from '../src/certificates/ContentHash.js';

describe('Certificate content hash (#913)', () => {
  const baseFields = {
    id: 'cert-1',
    studentId: 'student-1',
    courseId: 'course-1',
    tokenId: 'token-1',
    grade: 'A',
    did: 'did:stellar:GSTUDENT',
    issuedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('generates a deterministic hash for the same logical certificate', () => {
    const hash1 = computeCertificateContentHash(baseFields);
    const hash2 = computeCertificateContentHash({ ...baseFields });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the same hash regardless of key order or Date vs ISO string', () => {
    const reordered = {
      issuedAt: baseFields.issuedAt.toISOString(),
      did: baseFields.did,
      grade: baseFields.grade,
      tokenId: baseFields.tokenId,
      courseId: baseFields.courseId,
      studentId: baseFields.studentId,
      id: baseFields.id,
    };

    expect(computeCertificateContentHash(reordered)).toBe(computeCertificateContentHash(baseFields));
  });

  it('changes the hash when any hashable field changes', () => {
    const original = computeCertificateContentHash(baseFields);
    const mutated = computeCertificateContentHash({ ...baseFields, grade: 'B' });
    expect(mutated).not.toBe(original);
  });

  it('produces a canonical string with sorted keys', () => {
    const canonical = canonicalizeCertificateFields(baseFields);
    const keys = Object.keys(JSON.parse(canonical));
    expect(keys).toEqual([...keys].sort());
  });

  describe('verifyCertificateContentHash', () => {
    it('reports valid when the recomputed hash matches the stored hash', () => {
      const storedHash = computeCertificateContentHash(baseFields);
      const result = verifyCertificateContentHash(baseFields, storedHash);
      expect(result.state).toBe('valid');
    });

    it('reports tampered when stored metadata no longer matches the stored hash', () => {
      const storedHash = computeCertificateContentHash(baseFields);
      const tamperedFields = { ...baseFields, grade: 'A+' };
      const result = verifyCertificateContentHash(tamperedFields, storedHash);
      expect(result.state).toBe('tampered');
      if (result.state === 'tampered') {
        expect(result.expected).toBe(storedHash);
        expect(result.actual).not.toBe(storedHash);
      }
    });

    it('reports unverified (not tampered) for legacy certificates with no stored hash', () => {
      const result = verifyCertificateContentHash(baseFields, null);
      expect(result.state).toBe('unverified');
    });
  });
});
