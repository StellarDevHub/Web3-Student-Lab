import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCertificatesOG } from '../certificates/[id]/route';
import { GET as getCertificateOG } from '../certificate/[id]/route';
import { GET as getStudentCertificates } from '../../v1/certificates/student/[id]/route';
import { GET as getStudentEnrollments } from '../../v1/enrollments/student/[id]/route';
import { GET as getCourseById } from '../../v1/courses/[id]/route';
import { generateMetadata } from '../../../certificates/[id]/metadata';

describe('Next.js 16 Route Handlers Async Params Migration', () => {
  describe('GET /api/og/certificates/[id]', () => {
    it('returns HTTP 200 image response with async params', async () => {
      const request = new NextRequest('http://localhost:3000/api/og/certificates/cert-123');
      const params = Promise.resolve({ id: 'cert-123' });

      const response = await getCertificatesOG(request, { params });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('generates card with different certificate IDs', async () => {
      const request = new NextRequest('http://localhost:3000/api/og/certificates/custom-id-999');
      const params = Promise.resolve({ id: 'custom-id-999' });

      const response = await getCertificatesOG(request, { params });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });
  });

  describe('GET /api/og/certificate/[id]', () => {
    it('returns HTTP 200 image response with async params and default query', async () => {
      const request = new NextRequest('http://localhost:3000/api/og/certificate/cert-456');
      const params = Promise.resolve({ id: 'cert-456' });

      const response = await getCertificateOG(request, { params });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('returns HTTP 200 with custom query parameters', async () => {
      const url = new URL('http://localhost:3000/api/og/certificate/cert-789');
      url.searchParams.set('studentName', 'Alice Nakamoto');
      url.searchParams.set('course', 'Soroban Advanced Rust');
      url.searchParams.set('date', '2026-11-22');
      url.searchParams.set('hash', '0x1234567890abcdef1234567890abcdef12345678');

      const request = new NextRequest(url.toString());
      const params = Promise.resolve({ id: 'cert-789' });

      const response = await getCertificateOG(request, { params });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });
  });

  describe('GET /api/v1/certificates/student/[id]', () => {
    it('returns HTTP 200 JSON with certificates list awaiting async params', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/certificates/student/student-1'
      );
      const params = Promise.resolve({ id: 'student-1' });

      const response = await getStudentCertificates(request, { params });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ certificates: [], studentId: 'student-1' });
    });
  });

  describe('GET /api/v1/enrollments/student/[id]', () => {
    it('returns HTTP 200 JSON array awaiting async params', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/enrollments/student/student-1');
      const params = Promise.resolve({ id: 'student-1' });

      const response = await getStudentEnrollments(request, { params });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual([]);
    });
  });

  describe('GET /api/v1/courses/[id]', () => {
    it('returns HTTP 200 JSON for existing course awaiting async params', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/courses/blockchain-foundations'
      );
      const params = Promise.resolve({ id: 'blockchain-foundations' });

      const response = await getCourseById(request, { params });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.course).toBeDefined();
      expect(json.course.id).toBe('blockchain-foundations');
    });

    it('returns HTTP 404 for non-existent course awaiting async params', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/courses/non-existent-course');
      const params = Promise.resolve({ id: 'non-existent-course' });

      const response = await getCourseById(request, { params });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe('Course not found');
    });
  });

  describe('generateMetadata in /certificates/[id]/metadata', () => {
    it('correctly awaits async params Promise and generates metadata', async () => {
      const params = Promise.resolve({ id: 'CERT-42' });

      const metadata = await generateMetadata({ params });

      expect(metadata.title).toBe('Certificate #CERT-42 | Web3 Student Lab');
      expect(metadata.description).toBe(
        'Blockchain-verified certificate of completion on the Stellar network.'
      );
      expect(metadata.openGraph?.title).toBe('Certificate #CERT-42');
      expect(metadata.openGraph?.images).toContain(
        'http://localhost:8080/api/og/certificates/CERT-42'
      );
    });
  });
});
