import { describe, it, expect, beforeEach, beforeAll, afterAll, jest } from '@jest/globals';
import prisma from '../src/db/index';
import { certificateService } from '../src/certificates/index';
import { CertificateStatus } from '../src/types/certificate.types';

// Mock the blockchain service
jest.mock('../src/blockchain/CertificateBlockchainService', () => ({
  certificateBlockchainService: {
    mintCertificate: jest.fn().mockImplementation((metadata: any) => Promise.resolve({
      success: true,
      tokenId: metadata.verification.tokenId || '12345',
      transactionHash: '0x1234567890abcdef',
      contractAddress: 'GCERTIFICATECONTRACT',
    })),
    verifyOnChain: jest.fn().mockResolvedValue(true),
    getOwner: jest.fn().mockResolvedValue('GSTUDENTWALLET'),
    revokeCertificate: jest.fn().mockResolvedValue(undefined),
    getCertificateData: jest.fn().mockResolvedValue({
      tokenId: '12345',
      owner: 'GSTUDENTWALLET',
      metadataUri: 'http://localhost:8080/api/v1/certificates/12345/metadata',
      mintedAt: new Date(),
      contractAddress: 'GCERTIFICATECONTRACT',
      transactionHash: '0x1234567890abcdef',
      network: 'testnet',
    }),
  },
}));

describe('CertificateService', () => {
  const testStudentId = 'student-test-123';
  const testCourseId = 'course-test-456';
  let testEnrollmentId: string;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';

    // Create test data
    await prisma.student.create({
      data: {
        id: testStudentId,
        email: 'test.student@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      },
    });

    await prisma.course.create({
      data: {
        id: testCourseId,
        title: 'Test Course',
        instructor: 'Test Instructor',
        credits: 3,
      },
    });

    await prisma.enrollment.create({
      data: {
        studentId: testStudentId,
        courseId: testCourseId,
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.enrollment.deleteMany({
      where: { studentId: testStudentId },
    });
    await prisma.certificate.deleteMany({
      where: { studentId: testStudentId },
    });
    await prisma.enrollment.deleteMany({
      where: { courseId: testCourseId },
    });
    await prisma.student.delete({
      where: { id: testStudentId },
    });
    await prisma.course.delete({
      where: { id: testCourseId },
    });
    await prisma.$disconnect();
  });

  describe('mintCertificate', () => {
    it('should successfully mint a certificate for an enrolled student', async () => {
      const request = {
        studentId: testStudentId,
        courseId: testCourseId,
        tokenId: '12345',
      };

      const issuerDid = 'did:stellar:TESTISSUER123456789';
      const contractAddress = 'GCERTIFICATECONTRACT';
      const network = 'testnet';

      const result = await certificateService.mintCertificate(
        request,
        issuerDid,
        contractAddress,
        network
      );

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^cert-/);
      expect(result.tokenId).toBe('12345'); // From mock
      expect(result.status).toBe(CertificateStatus.ACTIVE);
      expect(result.certificateHash).toBe('0x1234567890abcdef');
      expect(result.contractAddress).toBe(contractAddress);
      expect(result.network).toBe(network);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.name).toContain('John Doe');
      expect(result.metadata.course.title).toBe('Test Course');
    });

    it('should throw error for non-existent student', async () => {
      const request = {
        studentId: 'non-existent-student',
        courseId: testCourseId,
      };

      await expect(
        certificateService.mintCertificate(request, 'did:stellar:TEST', 'GCONTRACT', 'testnet')
      ).rejects.toThrow('Student with ID non-existent-student not found');
    });

    it('should throw error for non-existent course', async () => {
      const request = {
        studentId: testStudentId,
        courseId: 'non-existent-course',
      };

      await expect(
        certificateService.mintCertificate(request, 'did:stellar:TEST', 'GCONTRACT', 'testnet')
      ).rejects.toThrow('Course with ID non-existent-course not found');
    });

    it('should throw error for student not enrolled', async () => {
      const unenrolledStudentId = 'student-unenrolled-789';

      // Create student but not enrolled
      await prisma.student.create({
        data: {
          id: unenrolledStudentId,
          email: 'unenrolled@example.com',
          password: 'password',
          firstName: 'Jane',
          lastName: 'Smith',
        },
      });

      const request = {
        studentId: unenrolledStudentId,
        courseId: testCourseId,
      };

      await expect(
        certificateService.mintCertificate(request, 'did:stellar:TEST', 'GCONTRACT', 'testnet')
      ).rejects.toThrow(`Student ${unenrolledStudentId} is not enrolled in course ${testCourseId}`);

      // Cleanup
      await prisma.student.delete({
        where: { id: unenrolledStudentId },
      });
    });

    it('should generate tokenId if not provided', async () => {
      const existingCerts = await prisma.certificate.count();

      const request = {
        studentId: testStudentId,
        courseId: testCourseId,
      };

      await certificateService.mintCertificate(request, 'did:stellar:TEST', 'GCONTRACT', 'testnet');

      const newCount = await prisma.certificate.count();
      expect(newCount).toBe(existingCerts + 1);
    });
  });

  describe('verifyCertificateById', () => {
    it('should return valid verification for existing certificate', async () => {
      // First mint a certificate
      const mintResult = await certificateService.mintCertificate(
        {
          studentId: testStudentId,
          courseId: testCourseId,
        },
        'did:stellar:ISSUER',
        'GCERTIFICATECONTRACT',
        'testnet'
      );

      const verification = await certificateService.verifyCertificateById(mintResult.id);

      expect(verification.isValid).toBe(true);
      expect(verification.status).toBe(CertificateStatus.ACTIVE);
      expect(verification.certificate).toBeDefined();
      expect(verification.certificate!.name).toContain('John Doe');
      expect(verification.onChainData).toBeDefined();
      expect(verification.onChainData!.tokenId).toBe(mintResult.tokenId);
      expect(verification.onChainData!.owner).toBe('GSTUDENTWALLET');
    });

    it('should return not found for non-existent certificate', async () => {
      const verification = await certificateService.verifyCertificateById('non-existent-id');

      expect(verification.isValid).toBe(false);
      expect(verification.certificate).toBeNull();
      expect(verification.message).toBe('Certificate not found');
    });
  });

  describe('batchVerify', () => {
    it('should verify multiple certificates in batch', async () => {
      // Mint two certificates
      const cert1 = await certificateService.mintCertificate(
        { studentId: testStudentId, courseId: testCourseId },
        'did:stellar:ISSUER',
        'GCONTRACT',
        'testnet'
      );

      // Second mint with different tokenId
      const cert2 = await certificateService.mintCertificate(
        { studentId: testStudentId, courseId: testCourseId, tokenId: '67890' },
        'did:stellar:ISSUER',
        'GCONTRACT',
        'testnet'
      );

      const results = await certificateService.batchVerify([cert1.tokenId!, cert2.tokenId!]);

      expect(results.length).toBe(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should handle non-existent tokenIds', async () => {
      const results = await certificateService.batchVerify(['nonexistent1', 'nonexistent2']);

      expect(results.length).toBe(2);
      expect(results[0].isValid).toBe(false);
      expect(results[0].message).toBe('Certificate not found');
    });

    it('should throw error for more than 100 tokenIds', async () => {
      const tooMany = Array(101).fill('tokenid');
      await expect(certificateService.batchVerify(tooMany)).rejects.toThrow(
        'Maximum 100 certificates allowed per batch verification'
      );
    });
  });

  describe('getMetadata', () => {
    it('should return NFT-compliant metadata', async () => {
      const mintResult = await certificateService.mintCertificate(
        { studentId: testStudentId, courseId: testCourseId },
        'did:stellar:ISSUER',
        'GCONTRACT',
        'testnet'
      );

      const metadata = await certificateService.getMetadata(mintResult.tokenId!);

      expect(metadata).toBeDefined();
      expect(metadata.name).toBeDefined();
      expect(metadata.description).toBeDefined();
      expect(metadata.image).toBeDefined();
      expect(metadata.external_url).toBeDefined();
      expect(metadata.attributes).toBeInstanceOf(Array);
      expect(metadata.attributes.length).toBeGreaterThan(0);
      expect(metadata.course).toBeDefined();
      expect(metadata.course.title).toBe('Test Course');
      expect(metadata.student).toBeDefined();
      expect(metadata.student.name).toBe('John Doe');
      expect(metadata.verification).toBeDefined();
      expect(metadata.standard).toBe('Stellar NFT Certificate v1.0');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should return null for non-existent certificate', async () => {
      const metadata = await certificateService.getMetadata('nonexistent');
      expect(metadata).toBeNull();
    });
  });

  describe('revokeCertificate', () => {
    it('should successfully revoke an active certificate', async () => {
      const cert = await certificateService.mintCertificate(
        { studentId: testStudentId, courseId: testCourseId },
        'did:stellar:ISSUER',
        'GCONTRACT',
        'testnet'
      );

      const reason = 'Certificate was issued in error';
      const revokedBy = 'did:stellar:ADMIN';

      const result = await certificateService.revokeCertificate(cert.id, reason, revokedBy);

      expect(result.status).toBe(CertificateStatus.REVOKED);
      expect(result.revokedAt).toBeInstanceOf(Date);
      expect(result.revocationReason).toBe(reason);
      expect(result.revokedBy).toBe(revokedBy);
    });

    it('should throw error when revoking already revoked certificate', async () => {
      const cert = await certificateService.mintCertificate(
        { studentId: testStudentId, courseId: testCourseId },
        'did:stellar:ISSUER',
        'GCONTRACT',
        'testnet'
      );

      await certificateService.revokeCertificate(cert.id, 'First revocation', 'did:stellar:ADMIN');

      await expect(
        certificateService.revokeCertificate(cert.id, 'Second revocation', 'did:stellar:ADMIN')
      ).rejects.toThrow('Certificate already revoked');
    });

    it('should throw error when revoking non-existent certificate', async () => {
      await expect(
        certificateService.revokeCertificate('non-existent-id', 'Test', 'did:stellar:ADMIN')
      ).rejects.toThrow('Certificate not found');
    });
  });

  describe('reissueCertificate', () => {
    it('should successfully reissue a certificate', async () => {
      const original = await certificateService.mintCertificate(
        { studentId: testStudentId, courseId: testCourseId, grade: 'B' },
        'did:stellar:ISSUER',
        'GCONTRACT',
        'testnet'
      );

      const result = await certificateService.reissueCertificate(
        original.id,
        'Grade correction',
        'A',
        'did:stellar:INSTRUCTOR'
      );

      expect(result.new).toBeDefined();
      expect(result.new.id).not.toBe(original.id);
      expect(result.new.grade).toBe('A');
      expect(result.original.status).toBe(CertificateStatus.REISSUED);
      expect(result.new.previousVersionId).toBe(original.id);
    });

    it('should throw error when reissuing revoked certificate', async () => {
      const cert = await certificateService.mintCertificate(
        { studentId: testStudentId, courseId: testCourseId },
        'did:stellar:ISSUER',
        'GCONTRACT',
        'testnet'
      );

      await certificateService.revokeCertificate(cert.id, 'Revoked', 'did:stellar:ADMIN');

      await expect(
        certificateService.reissueCertificate(cert.id, 'Test', 'A', 'did:stellar:INSTRUCTOR')
      ).rejects.toThrow('Cannot reissue a revoked certificate');
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics summary', async () => {
      // Mint some certificates
      for (let i = 0; i < 3; i++) {
        await certificateService.mintCertificate(
          { studentId: testStudentId, courseId: testCourseId },
          'did:stellar:ISSUER',
          'GCONTRACT',
          'testnet'
        );
      }

      const analytics = await certificateService.getAnalytics();

      expect(analytics.totalCertificates).toBeGreaterThanOrEqual(3);
      expect(analytics.byStatus).toBeDefined();
      expect(analytics.uniqueStudents).toBe(1);
      expect(analytics.uniqueCourses).toBe(1);
    });
  });
});

describe('Certificate Verification Integration', () => {
  const testStudentId = 'student-integration-123';
  const testCourseId = 'course-integration-456';

  beforeAll(async () => {
    // Setup test data
    await prisma.student.create({
      data: {
        id: testStudentId,
        email: 'integration@example.com',
        password: 'password',
        firstName: 'Alice',
        lastName: 'Johnson',
      },
    });

    await prisma.course.create({
      data: {
        id: testCourseId,
        title: 'Integration Test Course',
        instructor: 'Integration Prof',
        credits: 3,
      },
    });

    await prisma.enrollment.create({
      data: {
        studentId: testStudentId,
        courseId: testCourseId,
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { studentId: testStudentId } });
    await prisma.certificate.deleteMany({ where: { studentId: testStudentId } });
    await prisma.student.delete({ where: { id: testStudentId } });
    await prisma.course.delete({ where: { id: testCourseId } });
    await prisma.$disconnect();
  });

  it('should support full lifecycle: mint -> verify -> revoke', async () => {
    // 1. Mint
    const mint = await certificateService.mintCertificate(
      { studentId: testStudentId, courseId: testCourseId },
      'did:stellar:ISSUER',
      'GCONTRACT',
      'testnet'
    );
    expect(mint.status).toBe(CertificateStatus.ACTIVE);

    // 2. Verify
    const verifyResult = await certificateService.verifyCertificateById(mint.id);
    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.certificate).toBeDefined();

    // 3. Revoke
    await certificateService.revokeCertificate(mint.id, 'No longer valid', 'did:stellar:ADMIN');

    // 4. Verify again - should show revoked
    const revokedVerify = await certificateService.verifyCertificateById(mint.id);
    expect(revokedVerify.status).toBe(CertificateStatus.REVOKED);
    expect(revokedVerify.isValid).toBe(false);
    expect(revokedVerify.revocationInfo).toBeDefined();
  });

  it('should support reissue lifecycle', async () => {
    // Mint original
    const original = await certificateService.mintCertificate(
      { studentId: testStudentId, courseId: testCourseId, grade: 'C' },
      'did:stellar:ISSUER',
      'GCONTRACT',
      'testnet'
    );

    // Reissue with corrected grade
    const { new: reissued } = await certificateService.reissueCertificate(
      original.id,
      'Grade correction',
      'A',
      'did:stellar:INSTRUCTOR'
    );

    expect(reissued.grade).toBe('A');
    expect(reissued.previousVersionId).toBe(original.id);

    // Original should be REISSUED status
    const originalUpdated = await certificateService.getCertificateById(original.id);
    expect(originalUpdated?.status).toBe(CertificateStatus.REISSUED);
  });

  it('should provide full metadata compliance for NFT marketplaces', async () => {
    const cert = await certificateService.mintCertificate(
      { studentId: testStudentId, courseId: testCourseId },
      'did:stellar:ISSUER',
      'GCONTRACT',
      'testnet'
    );

    const metadata = await certificateService.getMetadata(cert.tokenId!);

    // Check required ERC-721 fields
    expect(metadata.name).toBeTruthy();
    expect(metadata.description).toBeTruthy();
    expect(metadata.image).toMatch(/^https?:\/\//);
    expect(metadata.external_url).toMatch(/^https?:\/\//);

    // Check educational attributes
    expect(metadata.attributes).toBeInstanceOf(Array);
    expect(metadata.attributes.length).toBeGreaterThan(0);
    metadata.attributes.forEach((attr) => {
      expect(attr.trait_type).toBeTruthy();
      expect(attr.value !== undefined).toBe(true);
    });

    // Check compliance
    expect(metadata.standard).toBe('Stellar NFT Certificate v1.0');
    expect(metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
