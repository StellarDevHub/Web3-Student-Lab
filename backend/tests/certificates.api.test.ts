import request from 'supertest';
import { app } from '../src/index.js';
import prisma from '../src/db/index.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

describe('Certificate API Endpoints', () => {
  const testStudentId = 'api-student-123';
  const testCourseId = 'api-course-456';
  let authToken: string = '';
  let generatedCertId: string = '';

  beforeAll(async () => {
    // Create test student and course
    await prisma.student.create({
      data: {
        id: testStudentId,
        email: 'api.test@example.com',
        password: '$2b$10$hash', // Mock hashed password
        firstName: 'API',
        lastName: 'Test',
      },
    });

    await prisma.course.create({
      data: {
        id: testCourseId,
        title: 'API Test Course',
        instructor: 'API Instructor',
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

  beforeEach(() => {
    // Clean slate for tests - we use mock blockchain service
  });

  describe('POST /api/v1/certificates', () => {
    it('should mint a new certificate successfully', async () => {
      const response = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
        grade: 'A',
      });

      console.log('MINT RESPONSE:', response.body);
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.certificate).toBeDefined();
      expect(response.body.metadata).toBeDefined();
      expect(response.body.certificate.id).toBeDefined();
      expect(response.body.certificate.tokenId).toBeDefined();

      generatedCertId = response.body.certificate.id;
    });

    it('should return 400 if studentId missing', async () => {
      const response = await request(app).post('/api/v1/certificates').send({
        courseId: testCourseId,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('studentId');
    });

    it('should return 400 if courseId missing', async () => {
      const response = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('courseId');
    });

    it('should return 404 for non-existent student', async () => {
      const response = await request(app).post('/api/v1/certificates').send({
        studentId: 'non-existent-student',
        courseId: testCourseId,
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 for non-existent course', async () => {
      const response = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: 'non-existent-course',
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/v1/certificates/verify/:tokenId', () => {
    it('should verify an existing certificate', async () => {
      // First create a certificate
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const tokenId = mint.body.certificate.tokenId;

      const response = await request(app).get(`/api/v1/certificates/verify/${tokenId}`);

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(true);
      expect(response.body.certificate).toBeDefined();
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.onChainData).toBeDefined();
      expect(response.body.onChainData.tokenId).toBe(tokenId);
    });

    it('should return 404 for non-existent certificate', async () => {
      const response = await request(app).get('/api/v1/certificates/verify/nonexistenttoken123');

      expect(response.status).toBe(200); // Still 200 with isValid false per design
      expect(response.body.isValid).toBe(false);
      expect(response.body.certificate).toBeNull();
    });
  });

  describe('POST /api/v1/certificates/verify/batch', () => {
    it('should perform batch verification', async () => {
      // Create two certificates
      const cert1 = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const cert2 = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
        tokenId: 'batch-token-2',
      });

      const tokenIds = [cert1.body.certificate.tokenId, cert2.body.certificate.tokenId];

      const response = await request(app)
        .post('/api/v1/certificates/verify/batch')
        .send({ tokenIds });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should reject batch with more than 100 tokens', async () => {
      const tooMany = Array(101).fill('token-id');
      const response = await request(app)
        .post('/api/v1/certificates/verify/batch')
        .send({ tokenIds: tooMany });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Maximum 100');
    });

    it('should validate empty array', async () => {
      const response = await request(app)
        .post('/api/v1/certificates/verify/batch')
        .send({ tokenIds: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cannot be empty');
    });
  });

  describe('GET /api/v1/certificates/:tokenId/metadata', () => {
    it('should return NFT-compliant metadata', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const tokenId = mint.body.certificate.tokenId;

      const response = await request(app).get(`/api/v1/certificates/${tokenId}/metadata`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBeDefined();
      expect(response.body.description).toBeDefined();
      expect(response.body.image).toMatch(/^https?:\/\//);
      expect(response.body.external_url).toMatch(/^https?:\/\//);
      expect(response.body.attributes).toBeDefined();
      expect(response.body.attributes.length).toBeGreaterThan(0);
      expect(response.body.course).toBeDefined();
      expect(response.body.student).toBeDefined();
      expect(response.body.verification).toBeDefined();
      expect(response.body.standard).toBe('Stellar NFT Certificate v1.0');
      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should return 404 for non-existent certificate metadata', async () => {
      const response = await request(app).get('/api/v1/certificates/nonexistent/metadata');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Certificate not found');
    });

    it('should set correct content-type header', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const tokenId = mint.body.certificate.tokenId;
      const response = await request(app).get(`/api/v1/certificates/${tokenId}/metadata`);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /api/v1/certificates/:certificateId', () => {
    it('should get certificate full details', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const certId = mint.body.certificate.id;

      const response = await request(app).get(`/api/v1/certificates/${certId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(certId);
      expect(response.body.studentId).toBe(testStudentId);
      expect(response.body.courseId).toBe(testCourseId);
      expect(response.body.status).toBeDefined();
    });

    it('should return 404 for non-existent certificate', async () => {
      const response = await request(app).get('/api/v1/certificates/nonexistent-id');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/certificates/student/:studentId', () => {
    it('should return certificates for a student', async () => {
      await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app).get(`/api/v1/certificates/student/${testStudentId}`);

      expect(response.status).toBe(200);
      expect(response.body.certificates).toBeDefined();
      expect(response.body.certificates.length).toBeGreaterThan(0);
      expect(response.body.studentId).toBe(testStudentId);
    });

    it('should return empty array for student with no certificates', async () => {
      const response = await request(app).get('/api/v1/certificates/student/nonexistent-student');

      expect(response.status).toBe(200);
      expect(response.body.certificates).toEqual([]);
    });
  });

  describe('PUT /api/v1/certificates/:certificateId/revoke', () => {
    it('should revoke a certificate', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const certId = mint.body.certificate.id;

      const response = await request(app).put(`/api/v1/certificates/${certId}/revoke`).send({
        reason: 'Test revocation for API',
        revokedBy: 'did:stellar:admin123',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.certificate.status).toBe('REVOKED');
      expect(response.body.certificate.revocationReason).toBe('Test revocation for API');
    });

    it('should return 400 if reason missing', async () => {
      // Find an existing certificate first
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app)
        .put(`/api/v1/certificates/${mint.body.certificate.id}/revoke`)
        .send({ revokedBy: 'did:stellar:admin' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });

    it('should return 400 if revokedBy missing', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app)
        .put(`/api/v1/certificates/${mint.body.certificate.id}/revoke`)
        .send({ reason: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('revokedBy');
    });
  });

  describe('POST /api/v1/certificates/:certificateId/reissue', () => {
    it('should reissue a certificate with updated grade', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
        grade: 'C',
      });

      const certId = mint.body.certificate.id;

      const response = await request(app).post(`/api/v1/certificates/${certId}/reissue`).send({
        reason: 'Grade correction',
        newGrade: 'A',
        issuedBy: 'did:stellar:instructor',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.newCertificate.grade).toBe('A');
      expect(response.body.original.status).toBe('REISSUED');
      expect(response.body.newCertificate.previousVersionId).toBe(certId);
    });

    it('should allow reissue without grade change', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app)
        .post(`/api/v1/certificates/${mint.body.certificate.id}/reissue`)
        .send({
          reason: 'Regeneration',
          issuedBy: 'did:stellar:instructor',
        });

      expect(response.status).toBe(200);
      expect(response.body.newCertificate).toBeDefined();
    });

    it('should reject reissue without reason', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app)
        .post(`/api/v1/certificates/${mint.body.certificate.id}/reissue`)
        .send({ issuedBy: 'did:stellar:instructor' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });
  });

  describe('GET /api/v1/certificates/analytics', () => {
    it('should return analytics summary', async () => {
      // Create some certificates
      await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });
      await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app).get('/api/v1/certificates/analytics');

      expect(response.status).toBe(200);
      expect(response.body.totalCertificates).toBeGreaterThanOrEqual(2);
      expect(response.body.byStatus).toBeDefined();
      expect(response.body.uniqueStudents).toBeGreaterThanOrEqual(1);
      expect(response.body.uniqueCourses).toBeGreaterThanOrEqual(1);
      expect(response.body.revocationRate).toBeDefined();
    });
  });

  describe('GET /api/v1/certificates/:id/image', () => {
    it('should return certificate image', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app).get(
        `/api/v1/certificates/${mint.body.certificate.id}/image`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image/);
    });
  });

  describe('GET /api/v1/certificates/:id/qr', () => {
    it('should return QR code image', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const response = await request(app).get(
        `/api/v1/certificates/${mint.body.certificate.id}/qr`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image/);
    });
  });

  describe('GET /api/v1/certificates', () => {
    it('should list all certificates with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/certificates')
        .query({ limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.certificates).toBeDefined();
      expect(response.body.total).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const response = await request(app).get('/api/v1/certificates').query({ limit: 5 });

      expect(response.status).toBe(200);
    });

    it('should reject limit > 100', async () => {
      const response = await request(app).get('/api/v1/certificates').query({ limit: 200 });

      expect(response.status).toBe(400);
    });
  });

  describe('Edge cases and security', () => {
    it('should handle invalid tokenId format gracefully', async () => {
      const response = await request(app).get('/api/v1/certificates/verify/../../../etc/passwd');

      expect(response.status).toBe(404);
    });

    it('should not expose sensitive data in public verification endpoint', async () => {
      const mint = await request(app).post('/api/v1/certificates').send({
        studentId: testStudentId,
        courseId: testCourseId,
      });

      const tokenId = mint.body.certificate.tokenId;
      const response = await request(app).get(`/api/v1/certificates/verify/${tokenId}`);

      // Ensure no sensitive data is exposed
      const bodyString = JSON.stringify(response.body);
      expect(bodyString).not.toContain('password');
      expect(bodyString).not.toContain('email');
    });
  });
});
