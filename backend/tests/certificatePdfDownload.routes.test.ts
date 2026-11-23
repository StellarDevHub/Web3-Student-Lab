jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    certificate: { findUnique: jest.fn() },
  },
}));

jest.mock('../src/certificates/PdfGenerator.js', () => ({
  __esModule: true,
  certificatePdfGenerator: { generatePdf: jest.fn() },
}));

import request from 'supertest';
import { app } from '../src/index.js';
import prisma from '../src/db/index.js';
import { certificatePdfGenerator } from '../src/certificates/PdfGenerator.js';

describe('Signed certificate PDF download', () => {
  beforeEach(() => {
    jest.mocked(prisma.certificate.findUnique).mockResolvedValue({
      id: 'cert-be072-route',
      issuedAt: new Date('2026-11-23T00:00:00.000Z'),
      grade: 'A',
      student: { firstName: 'Jane', lastName: 'Doe' },
      course: { title: 'Applied Cryptography', instructor: 'Prof. Ada Lovelace' },
    } as never);

    jest.mocked(certificatePdfGenerator.generatePdf).mockResolvedValue({
      pdfBytes: Buffer.from('%PDF-1.4 mock'),
      signature: 'ab'.repeat(64),
      sha256: 'cd'.repeat(32),
      documentDigest: 'ef'.repeat(32),
      certificateId: 'cert-be072-route',
      sizeBytes: 13,
      publicKeyHex: '12'.repeat(32),
    });
  });

  it('returns the PDF with signature, key, ID and digest headers', async () => {
    const response = await request(app).get('/api/v1/certificates/cert-be072-route/download.pdf');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/pdf/);
    expect(response.headers['content-disposition']).toContain('certificate-cert-be072-route.pdf');
    expect(response.headers['x-certificate-id']).toBe('cert-be072-route');
    expect(response.headers['x-certificate-signature']).toBe('ab'.repeat(64));
    expect(response.headers['x-certificate-public-key']).toBe('12'.repeat(32));
    expect(response.headers['x-certificate-digest']).toBe('ef'.repeat(32));
    expect(response.headers['x-certificate-sha256']).toBe('cd'.repeat(32));
    expect(certificatePdfGenerator.generatePdf).toHaveBeenCalledWith({
      studentName: 'Jane Doe',
      courseTitle: 'Applied Cryptography',
      instructor: 'Prof. Ada Lovelace',
      issuedAt: '2026-11-23T00:00:00.000Z',
      certificateId: 'cert-be072-route',
      grade: 'A',
    });
  });
});
