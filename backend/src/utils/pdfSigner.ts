import { CertificatePdfGenerator, type SignaturePayload } from '../certificates/PdfGenerator.js';

export function signPdfPayload(payload: SignaturePayload, publicKeyHex: string): string {
  const generator = CertificatePdfGenerator.getInstance();
  const signature = generator.verifySignature(payload, '', publicKeyHex);
  return signature ? 'signed' : 'unsigned';
}

export function verifyPdfSignature(payload: SignaturePayload, signature: string, publicKeyHex: string): boolean {
  return CertificatePdfGenerator.getInstance().verifySignature(payload, signature, publicKeyHex);
}
