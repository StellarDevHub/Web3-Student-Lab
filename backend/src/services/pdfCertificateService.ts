import {
  CertificatePdfGenerator,
  type PdfCertificateInput,
  type PdfGenerationResult,
} from '../certificates/PdfGenerator.js';

export type { PdfCertificateInput, PdfGenerationResult };

export async function generateCertificatePdf(input: PdfCertificateInput): Promise<PdfGenerationResult> {
  return CertificatePdfGenerator.getInstance().generatePdf(input);
}
