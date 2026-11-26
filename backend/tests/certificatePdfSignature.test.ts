import crypto from 'crypto';
import {
  certificatePdfGenerator,
  verifyPdfSignature,
} from '../src/certificates/PdfGenerator.js';

describe('Certificate PDF Ed25519 signing (BE-072)', () => {
  const input = {
    studentName: 'Jane Doe',
    courseTitle: 'Applied Cryptography',
    instructor: 'Prof. Ada Lovelace',
    issuedAt: '2026-11-23T00:00:00.000Z',
    certificateId: 'cert-be072-001',
    grade: 'A+',
  };

  it('embeds the signature, public key and certificate ID in the PDF', async () => {
    const result = await certificatePdfGenerator.generatePdf(input);
    const bytes = Buffer.from(result.pdfBytes);
    const text = bytes.toString('latin1');

    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(result.documentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(text).toContain(`ed25519-sig:${result.signature}`);
    expect(text).toContain(`ed25519-pub:${result.publicKeyHex}`);
    expect(text).toContain(`cert-id:${input.certificateId}`);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(result.sha256);
    expect(certificatePdfGenerator.verifyPdfSignature(bytes)).toBe(true);
    expect(verifyPdfSignature(bytes)).toBe(true);
    expect(certificatePdfGenerator.verifySignature(bytes, result.signature, result.publicKeyHex)).toBe(true);
    expect(
      certificatePdfGenerator.verifySignature(result.documentDigest, result.signature, result.publicKeyHex)
    ).toBe(true);
  });

  it('invalidates verification when a rendered byte changes', async () => {
    const result = await certificatePdfGenerator.generatePdf(input);
    const bytes = Buffer.from(result.pdfBytes);
    const index = bytes.indexOf(Buffer.from(input.studentName));

    expect(index).toBeGreaterThan(-1);
    bytes[index] ^= 0x01;
    expect(certificatePdfGenerator.verifyPdfSignature(bytes)).toBe(false);
  });

  it('invalidates verification when the embedded signature changes', async () => {
    const result = await certificatePdfGenerator.generatePdf(input);
    const bytes = Buffer.from(result.pdfBytes);
    const marker = Buffer.from('ed25519-sig:');
    const index = bytes.indexOf(marker);
    const signatureByteIndex = index + marker.length;

    expect(index).toBeGreaterThan(-1);
    bytes[signatureByteIndex] = bytes[signatureByteIndex] === 0x61 ? 0x62 : 0x61;
    expect(certificatePdfGenerator.verifyPdfSignature(bytes)).toBe(false);
  });

  it('rejects a signature that does not match the supplied metadata', async () => {
    const result = await certificatePdfGenerator.generatePdf(input);
    const lastChar = result.signature.slice(-1);
    const wrongSignature = `${result.signature.slice(0, -1)}${lastChar === '0' ? '1' : '0'}`;

    expect(
      certificatePdfGenerator.verifyPdfSignature(result.pdfBytes, wrongSignature, result.publicKeyHex)
    ).toBe(false);
  });

  it('generates more than 20 diplomas per second under load', async () => {
    await certificatePdfGenerator.generatePdf({ ...input, certificateId: 'cert-be072-warmup' });

    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        certificatePdfGenerator.generatePdf({ ...input, certificateId: `cert-be072-perf-${index}` })
      )
    );
    const elapsedMs = Date.now() - started;

    expect(results).toHaveLength(20);
    expect(results.every((result) => certificatePdfGenerator.verifyPdfSignature(result.pdfBytes))).toBe(true);
    expect(20 / (elapsedMs / 1000)).toBeGreaterThan(20);
  }, 15000);
});
