import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  CertificateMetadataSchema,
  MintCertificateSchema,
  RevokeCertificateSchema,
  ReissueCertificateSchema,
  BatchVerificationSchema,
  CertificateImageOptionsSchema,
  QRCodeOptionsSchema,
} from '../src/routes/certificates/validation.schemas.js';
import { z } from 'zod';

describe('Certificate Validation Schemas', () => {
  describe('CertificateMetadataSchema', () => {
    const validMetadata = {
      name: 'John Doe - Introduction to Web3 Certificate',
      description:
        'This certifies that John Doe has successfully completed the course "Introduction to Web3" on 2024-01-15.',
      image: 'https://api.web3-student-lab.com/certificates/123/image.png',
      external_url: 'https://web3-student-lab.com/certificates/123',
      attributes: [
        { trait_type: 'Course Title', value: 'Introduction to Web3' },
        { trait_type: 'Credits', value: 3 },
        { trait_type: 'Grade', value: 'A' },
      ],
      course: {
        id: 'course-123',
        title: 'Introduction to Web3',
        instructor: 'Dr. Smith',
        credits: 3,
        completionDate: '2024-01-15',
        grade: 'A',
      },
      student: {
        name: 'John Doe',
        walletAddress: 'GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT', // valid Stellar key
      },
      verification: {
        certificateId: 'cert-123',
        mintedAt: '2024-01-15T10:30:00Z',
        contractAddress: 'GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT',
        tokenId: '12345',
        network: 'stellar-testnet',
        issuerDid: 'did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT',
      },
      standard: 'Stellar NFT Certificate v1.0',
      version: '1.0.0',
    };

    it('should validate a complete valid certificate metadata object', () => {
      const result = CertificateMetadataSchema.parse(validMetadata);
      expect(result).toBeDefined();
      expect(result.name).toBe(validMetadata.name);
      expect(result.course.title).toBe('Introduction to Web3');
    });

    it('should reject missing required fields', () => {
      const {
        name,
        description,
        image,
        external_url,
        attributes,
        course,
        student,
        verification,
        standard,
        version,
        ...invalid
      } = validMetadata;

      expect(() => CertificateMetadataSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid wallet address format', () => {
      const invalid = {
        ...validMetadata,
        student: { ...validMetadata.student, walletAddress: 'INVALID' },
      };
      expect(() => CertificateMetadataSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid date format', () => {
      const invalid = {
        ...validMetadata,
        verification: { ...validMetadata.verification, mintedAt: 'not-a-date' },
      };
      expect(() => CertificateMetadataSchema.parse(invalid)).toThrow();
    });

    it('should reject wrong standard value', () => {
      const invalid = { ...validMetadata, standard: 'Wrong Standard' };
      expect(() => CertificateMetadataSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid version format', () => {
      const invalid = { ...validMetadata, version: '1.0' };
      expect(() => CertificateMetadataSchema.parse(invalid)).toThrow();
    });
  });

  describe('MintCertificateSchema', () => {
    it('should validate minimum valid mint request', () => {
      const valid = { studentId: 'student-123', courseId: 'course-456' };
      const result = MintCertificateSchema.parse(valid);
      expect(result.studentId).toBe('student-123');
      expect(result.courseId).toBe('course-456');
      expect(result.tokenId).toBeUndefined();
      expect(result.grade).toBeUndefined();
    });

    it('should validate mint request with all fields', () => {
      const valid = {
        studentId: 'student-123',
        courseId: 'course-456',
        tokenId: 'custom-token-789',
        grade: 'A',
        did: 'did:stellar:GBRPYHIL',
      };
      const result = MintCertificateSchema.parse(valid);
      expect(result.tokenId).toBe('custom-token-789');
      expect(result.grade).toBe('A');
    });

    it('should reject missing studentId', () => {
      const invalid = { courseId: 'course-456' };
      expect(() => MintCertificateSchema.parse(invalid)).toThrow();
    });

    it('should reject missing courseId', () => {
      const invalid = { studentId: 'student-123' };
      expect(() => MintCertificateSchema.parse(invalid)).toThrow();
    });
  });

  describe('RevokeCertificateSchema', () => {
    it('should validate valid revocation request', () => {
      const valid = {
        certificateId: 'cert-123',
        reason: 'Certificate issued with incorrect grade',
        revokedBy: 'did:stellar:ADMIN123456789',
      };
      const result = RevokeCertificateSchema.parse(valid);
      expect(result.reason).toHaveLength(43);
    });

    it('should reject missing reason', () => {
      const invalid = { certificateId: 'cert-123', revokedBy: 'did:stellar:ADMIN' };
      expect(() => RevokeCertificateSchema.parse(invalid)).toThrow();
    });

    it('should reject empty reason', () => {
      const invalid = { certificateId: 'cert-123', reason: '', revokedBy: 'did:stellar:ADMIN' };
      expect(() => RevokeCertificateSchema.parse(invalid)).toThrow();
    });
  });

  describe('ReissueCertificateSchema', () => {
    it('should validate valid reissue request', () => {
      const valid = {
        certificateId: 'cert-123',
        reason: 'Grade correction',
        newGrade: 'A',
        issuedBy: 'did:stellar:INSTRUCTOR',
      };
      const result = ReissueCertificateSchema.parse(valid);
      expect(result.newGrade).toBe('A');
    });

    it('should allow optional newGrade', () => {
      const valid = {
        certificateId: 'cert-123',
        reason: 'Update student information',
        issuedBy: 'did:stellar:INSTRUCTOR',
      };
      const result = ReissueCertificateSchema.parse(valid);
      expect(result.newGrade).toBeUndefined();
    });

    it('should reject missing reason', () => {
      const invalid = { certificateId: 'cert-123', issuedBy: 'did:stellar:INSTRUCTOR' };
      expect(() => ReissueCertificateSchema.parse(invalid)).toThrow();
    });
  });

  describe('BatchVerificationSchema', () => {
    it('should validate batch with valid tokenIds', () => {
      const valid = { tokenIds: ['12345', '67890', 'abcde'] };
      const result = BatchVerificationSchema.parse(valid);
      expect(result.tokenIds).toHaveLength(3);
    });

    it('should reject empty array', () => {
      const invalid = { tokenIds: [] };
      expect(() => BatchVerificationSchema.parse(invalid)).toThrow();
    });

    it('should reject more than 100 tokenIds', () => {
      const invalid = { tokenIds: Array(101).fill('token') };
      expect(() => BatchVerificationSchema.parse(invalid)).toThrow();
    });

    it('should accept exactly 100 tokenIds', () => {
      const valid = { tokenIds: Array(100).fill('token') };
      expect(() => BatchVerificationSchema.parse(valid)).not.toThrow();
    });
  });

  describe('CertificateImageOptionsSchema', () => {
    it('should validate complete image options', () => {
      const valid = {
        studentName: 'John Doe',
        courseTitle: 'Web3 Fundamentals',
        instructor: 'Dr. Smith',
        completionDate: '2024-01-15T00:00:00.000Z',
        grade: 'A',
        credentialId: 'cert-12345',
        issuerName: 'Web3 Student Lab',
        logoUrl: 'https://example.com/logo.png',
      };
      const result = CertificateImageOptionsSchema.parse(valid);
      expect(result.studentName).toBe('John Doe');
    });

    it('should validate without optional fields', () => {
      const valid = {
        studentName: 'John Doe',
        courseTitle: 'Web3 Fundamentals',
        instructor: 'Dr. Smith',
        completionDate: '2024-01-15T00:00:00.000Z',
        credentialId: 'cert-12345',
        issuerName: 'Web3 Student Lab',
      };
      expect(() => CertificateImageOptionsSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid date format', () => {
      const invalid = {
        studentName: 'John',
        courseTitle: 'Test',
        instructor: 'Dr. T',
        completionDate: 'invalid-date',
        credentialId: 'cert-1',
        issuerName: 'Test',
      };
      expect(() => CertificateImageOptionsSchema.parse(invalid)).toThrow();
    });
  });

  describe('QRCodeOptionsSchema', () => {
    it('should validate with minimum fields', () => {
      const valid = { data: 'https://example.com/verify/12345' };
      const result = QRCodeOptionsSchema.parse(valid);
      expect(result.data).toBe('https://example.com/verify/12345');
      expect(result.size).toBeUndefined();
      expect(result.format).toBeUndefined();
    });

    it('should validate with all fields', () => {
      const valid = { data: 'test', size: 300, format: 'png' as const };
      const result = QRCodeOptionsSchema.parse(valid);
      expect(result.size).toBe(300);
      expect(result.format).toBe('png');
    });

    it('should reject invalid format', () => {
      const invalid = { data: 'test', format: 'jpg' as const };
      expect(() => QRCodeOptionsSchema.parse(invalid)).toThrow();
    });
  });
});
